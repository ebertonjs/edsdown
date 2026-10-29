//! Multi-connection download of a normal HTTP file.
//!
//! Every connection ("worker") asks the segment table for work, downloads its
//! byte range with an HTTP Range request and writes straight into the right
//! offset of the `.sgpart` file. When a worker finishes it steals half of the
//! biggest remaining segment, so all connections stay busy until the end.

use crate::fileio::{make_normal, make_sparse, write_at};
use crate::http::{http_status_of, is_network_error, reconnect_delay, request, ConnGuard, HttpStatus, NetDrop, Progress, Shared};
use crate::model::RequestHeaders;
use crate::segments::{self, Segment};
use anyhow::{anyhow, bail};
use reqwest::header::{CONTENT_RANGE, RANGE};
use reqwest::StatusCode;
use std::fs::{File, OpenOptions};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

/// How long we wait for the next chunk before treating the connection as dead.
const STALL_TIMEOUT: Duration = Duration::from_secs(30);

/// Each connection gathers this much before it writes to the disk: a few big
/// writes instead of thousands of 16 KB ones, and none under the table lock.
const WRITE_BUF: usize = 2 * 1024 * 1024;
/// ...or writes what it has after this long, so slow downloads still show
/// their progress smoothly.
const WRITE_EVERY: Duration = Duration::from_millis(300);

#[derive(Clone)]
pub struct HttpJob {
    pub url: String,
    pub headers: RequestHeaders,
    pub user_agent: String,
    pub total_size: Option<u64>,
    pub resumable: bool,
    pub part_path: PathBuf,
    pub connections: u32,
    pub min_split: u64,
    pub retries: u32,
    /// Bytes from earlier stages of the same download (Dash: the video part
    /// when this job is the audio part), added to the progress counter.
    pub progress_base: u64,
    /// Ask for at most this many bytes per HTTP request. YouTube slows a
    /// connection down to playback speed when one request asks for too much,
    /// so for its servers we fetch each part in 10 MB requests.
    pub max_request: Option<u64>,
    /// this download's own speed limit (shared with its other parts)
    pub limiter: Arc<crate::limiter::SpeedLimiter>,
}

/// Request size limit for servers known to throttle big range requests.
pub fn max_request_for(url: &str) -> Option<u64> {
    let host = url::Url::parse(url).ok()?.host_str()?.to_ascii_lowercase();
    if host.ends_with("googlevideo.com") {
        Some(10 * 1024 * 1024)
    } else {
        None
    }
}

pub type SegTable = Arc<Mutex<Vec<Segment>>>;

#[derive(Debug)]
pub struct Cancelled;
impl std::fmt::Display for Cancelled {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("cancelled")
    }
}
impl std::error::Error for Cancelled {}

pub async fn run(
    shared: Arc<Shared>,
    job: HttpJob,
    segs: SegTable,
    progress: Arc<Progress>,
    cancel: CancellationToken,
) -> anyhow::Result<()> {
    if let Some(dir) = job.part_path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let segmented = job.resumable && job.total_size.is_some();
    let file = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .truncate(false)
        .open(&job.part_path)?;

    {
        let mut table = segs.lock().unwrap();
        if segmented {
            let total = job.total_size.unwrap_or(0);
            let fresh = table.is_empty() || file.metadata()?.len() == 0 && segments::downloaded(&table) > 0;
            if fresh {
                *table = segments::plan(total, job.connections, job.min_split);
                file.set_len(0)?;
            }
            if file.metadata()?.len() != total {
                make_sparse(&file);
                file.set_len(total)?;
            }
        } else {
            // no ranges: always start over with one connection
            file.set_len(0)?;
            *table = vec![Segment::new(0, job.total_size.unwrap_or(u64::MAX))];
        }
        // bytes taken by an earlier run but never written are fetched again
        segments::roll_back_inflight(&mut table);
        if segmented {
            segments::compact(&mut table);
        }
        for s in table.iter_mut() {
            s.active = false;
        }
        progress
            .bytes
            .store(job.progress_base + segments::downloaded(&table), Ordering::Relaxed);
    }

    let file = Arc::new(file);
    let child = cancel.child_token();
    let workers = if segmented { job.connections.max(1) } else { 1 };
    let mut set = JoinSet::new();
    for _ in 0..workers {
        let ctx = Worker {
            shared: shared.clone(),
            job: job.clone(),
            segs: segs.clone(),
            progress: progress.clone(),
            file: file.clone(),
            cancel: child.clone(),
            segmented,
        };
        set.spawn(ctx.run());
    }

    let mut first_error: Option<anyhow::Error> = None;
    while let Some(res) = set.join_next().await {
        let res = res.map_err(|e| anyhow!("worker crashed: {e}")).and_then(|r| r);
        if let Err(e) = res {
            if first_error.is_none() && !cancel.is_cancelled() {
                first_error = Some(e);
            }
            child.cancel();
        }
    }
    file.sync_all().ok();

    if cancel.is_cancelled() {
        return Err(Cancelled.into());
    }
    if let Some(e) = first_error {
        return Err(e);
    }
    {
        let table = segs.lock().unwrap();
        if segmented && !segments::all_finished(&table) {
            bail!("download ended before all parts were received");
        }
    }
    if segmented {
        make_normal(&file);
        file.sync_all().ok();
    }
    // the last handle must be gone before the file is renamed / opened
    drop(file);
    Ok(())
}

struct Worker {
    shared: Arc<Shared>,
    job: HttpJob,
    segs: SegTable,
    progress: Arc<Progress>,
    file: Arc<File>,
    cancel: CancellationToken,
    segmented: bool,
}

impl Worker {
    async fn run(self) -> anyhow::Result<()> {
        loop {
            let idx = {
                let mut table = self.segs.lock().unwrap();
                if self.segmented {
                    segments::claim_work(&mut table, self.job.min_split)
                } else {
                    let s = &mut table[0];
                    if s.active || s.is_finished() {
                        None
                    } else {
                        s.active = true;
                        Some(0)
                    }
                }
            };
            let Some(idx) = idx else { return Ok(()) };
            let result = self.download_segment(idx).await;
            {
                let mut table = self.segs.lock().unwrap();
                if let Some(s) = table.get_mut(idx) {
                    s.active = false;
                }
            }
            result?;
        }
    }

    /// Download one segment, retrying with back-off and continuing from where
    /// the previous attempt stopped.
    async fn download_segment(&self, idx: usize) -> anyhow::Result<()> {
        let mut attempt = 0u32;
        let mut net_tries = 0u32;
        loop {
            if self.cancel.is_cancelled() {
                return Err(Cancelled.into());
            }
            let before = self.segs.lock().unwrap()[idx].pos;
            let outcome = tokio::select! {
                r = self.fetch_once(idx) => r,
                _ = self.cancel.cancelled() => return Err(Cancelled.into()),
            };
            match outcome {
                Ok(()) => {
                    if self.segs.lock().unwrap()[idx].is_finished() {
                        return Ok(());
                    }
                    attempt = 0; // one request done, ask for the next piece
                }
                Err(e) => {
                    let after = self.segs.lock().unwrap()[idx].pos;
                    if after > before {
                        attempt = 0; // it was making progress, don't give up yet
                        net_tries = 0;
                    }
                    let network = is_network_error(&e);
                    let status = http_status_of(&e);
                    if network {
                        // no internet / reset / stall: wait as long as it takes,
                        // the part keeps what it already has
                        net_tries += 1;
                        self.progress.waiting.store(true, Ordering::Relaxed);
                    } else {
                        attempt += 1;
                        // an expired or removed link won't come back by itself
                        let gone = matches!(status, Some(401 | 403 | 404 | 410));
                        let limit = if gone { self.job.retries.min(2) } else { self.job.retries };
                        if attempt > limit {
                            if gone {
                                return Err(e.context(
                                    "the link has expired or the file was removed - use \"Refresh download address\"",
                                ));
                            }
                            return Err(e);
                        }
                    }
                    if !self.segmented {
                        // can't resume without ranges: restart from zero
                        let mut table = self.segs.lock().unwrap();
                        let s = &mut table[idx];
                        self.progress.bytes.fetch_sub(s.done(), Ordering::Relaxed);
                        s.pos = s.start;
                        let _ = self.file.set_len(0);
                    }
                    let backoff = if network {
                        reconnect_delay(net_tries)
                    } else {
                        Duration::from_secs((1u64 << attempt.min(5)).min(30))
                    };
                    tokio::select! {
                        _ = tokio::time::sleep(backoff) => {},
                        // another part got through: the internet is back
                        _ = self.progress.back_online.notified() => {},
                        _ = self.cancel.cancelled() => return Err(Cancelled.into()),
                    }
                }
            }
        }
    }

    /// Write `buf` (the bytes from file offset `at` on, already taken in the
    /// segment: `pos` moved past them and `inflight` counts them) on a
    /// blocking thread, outside the table lock, then count them as done.
    /// Returns where the next buffer starts.
    async fn flush(&self, idx: usize, buf: &mut Vec<u8>, at: u64) -> anyhow::Result<u64> {
        let n = buf.len() as u64;
        if n == 0 {
            return Ok(at);
        }
        let data = std::mem::take(buf);
        let file = self.file.clone();
        let (res, mut data) = tokio::task::spawn_blocking(move || {
            let r = write_at(&file, &data, at);
            (r, data)
        })
        .await
        .map_err(|e| anyhow!("disk writer crashed: {e}"))?;
        {
            let mut table = self.segs.lock().unwrap();
            let s = &mut table[idx];
            if res.is_ok() {
                s.inflight = s.inflight.saturating_sub(n);
            } else {
                // not on the disk: this connection owns the segment, so
                // everything from `at` on is fetched again
                s.pos = at.max(s.start);
                s.inflight = 0;
            }
        }
        res?;
        self.progress.bytes.fetch_add(n, Ordering::Relaxed);
        // data arrived: parts waiting for the internet try again now
        self.progress.online();
        data.clear();
        *buf = data; // keep the allocation for the next round
        Ok(at + n)
    }

    async fn fetch_once(&self, idx: usize) -> anyhow::Result<()> {
        let (pos, end) = {
            let table = self.segs.lock().unwrap();
            (table[idx].pos, table[idx].end)
        };
        if pos >= end {
            return Ok(());
        }
        // where this single request stops (the segment may need several)
        let req_end = match self.job.max_request {
            Some(limit) if self.segmented => end.min(pos + limit.max(1)),
            _ => end,
        };
        let mut rb = request(&self.shared.client(), &self.job.url, &self.job.headers, &self.job.user_agent);
        if self.segmented {
            rb = rb.header(RANGE, format!("bytes={}-{}", pos, req_end - 1));
        }
        let mut resp = rb.send().await?;
        let status = resp.status();
        if self.segmented {
            if status != StatusCode::PARTIAL_CONTENT {
                if status.is_client_error() || status.is_server_error() {
                    return Err(HttpStatus(status.as_u16()).into());
                }
                bail!("server did not accept the byte range (HTTP {})", status.as_u16());
            }
        } else if !status.is_success() {
            return Err(HttpStatus(status.as_u16()).into());
        }
        // the part the server really sent: some servers / CDNs answer 206
        // with another range than the one asked for (aligned blocks, or the
        // file from 0). Written at our offset that silently corrupts the
        // file (programs then "can't run on this PC"), so it is checked.
        let mut skip: u64 = 0;
        if self.segmented {
            let range = resp.headers().get(CONTENT_RANGE).and_then(|v| v.to_str().ok()).and_then(parse_content_range);
            match range {
                Some((start, _, total)) => {
                    if let (Some(t), Some(want)) = (total, self.job.total_size) {
                        if t != want {
                            bail!("the file on the server changed during the download ({want} -> {t} bytes): start it again");
                        }
                    }
                    if start > pos {
                        bail!("the server sent the wrong part of the file (asked from byte {pos}, got {start})");
                    }
                    // started earlier than asked: the extra bytes are skipped
                    skip = pos - start;
                }
                None => bail!("the server did not say which part of the file it sent"),
            }
        }
        let _guard = ConnGuard::new(&self.progress);

        // bytes received but not on the disk yet; they start at `buf_at`
        let mut buf: Vec<u8> = Vec::with_capacity(WRITE_BUF);
        let mut buf_at = pos;
        let mut last_write = std::time::Instant::now();
        let streamed: anyhow::Result<bool> = async {
            loop {
                let chunk = match tokio::time::timeout(STALL_TIMEOUT, resp.chunk()).await {
                    Ok(r) => r?,
                    Err(_) => return Err(NetDrop("connection timed out").into()),
                };
                let Some(mut chunk) = chunk else { return Ok(false) };
                if skip > 0 {
                    let n = (chunk.len() as u64).min(skip);
                    skip -= n;
                    let _ = chunk.split_to(n as usize);
                    if chunk.is_empty() {
                        continue;
                    }
                }
                self.shared.limiter.acquire(chunk.len()).await;
                self.job.limiter.acquire(chunk.len()).await;
                // take the bytes now (under the lock, no disk work): a split
                // by another worker then never hands them out again. `end`
                // may have moved down because another worker split us.
                let (take, full) = {
                    let mut table = self.segs.lock().unwrap();
                    let s = &mut table[idx];
                    let stop = s.end.min(req_end);
                    let take = (chunk.len() as u64).min(stop.saturating_sub(s.pos));
                    s.pos += take;
                    s.inflight += take;
                    (take as usize, s.pos >= stop)
                };
                buf.extend_from_slice(&chunk[..take]);
                if full || buf.len() >= WRITE_BUF || last_write.elapsed() >= WRITE_EVERY {
                    buf_at = self.flush(idx, &mut buf, buf_at).await?;
                    last_write = std::time::Instant::now();
                }
                if full {
                    return Ok(true); // dropping `resp` closes the connection
                }
            }
        }
        .await;
        // whatever arrived before an error is kept: the retry goes on from there
        if !buf.is_empty() {
            let flushed = self.flush(idx, &mut buf, buf_at).await;
            if streamed.is_ok() {
                flushed?;
            }
        }
        if streamed? {
            return Ok(());
        }

        // the server closed the stream
        let mut table = self.segs.lock().unwrap();
        let s = &mut table[idx];
        if !self.segmented && (self.job.total_size.is_none() || s.end == u64::MAX) {
            s.end = s.pos; // unknown size: end of stream means done
            return Ok(());
        }
        if s.pos >= s.end.min(req_end) {
            Ok(())
        } else {
            Err(NetDrop("connection closed early").into())
        }
    }
}

/// "bytes 100-199/1000" -> (100, 199, Some(1000)); "bytes 100-199/*" -> total None.
pub fn parse_content_range(v: &str) -> Option<(u64, u64, Option<u64>)> {
    let v = v.trim();
    let rest = v.strip_prefix("bytes").or_else(|| v.strip_prefix("Bytes"))?.trim_start();
    let (range, total) = rest.split_once('/')?;
    let (a, b) = range.trim().split_once('-')?;
    let (a, b) = (a.trim().parse::<u64>().ok()?, b.trim().parse::<u64>().ok()?);
    if b < a {
        return None;
    }
    let total = match total.trim() {
        "*" => None,
        t => Some(t.parse::<u64>().ok()?),
    };
    Some((a, b, total))
}

#[cfg(test)]
mod range_tests {
    use super::parse_content_range;
    #[test]
    fn content_range() {
        assert_eq!(parse_content_range("bytes 100-199/1000"), Some((100, 199, Some(1000))));
        assert_eq!(parse_content_range("bytes 0-0/*"), Some((0, 0, None)));
        assert_eq!(parse_content_range("bytes */1000"), None);
        assert_eq!(parse_content_range("items 1-2/3"), None);
    }
}
