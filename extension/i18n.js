// Texts of the add-in pages in the browser's language (_locales).
// data-i18n="key" sets the text, data-i18n-title / data-i18n-placeholder the attribute.
function T(key, ...subs) {
  try {
    return chrome.i18n.getMessage(key, subs.map(String)) || key;
  } catch {
    return key;
  }
}

document.documentElement.lang = (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || "en";
for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = T(el.dataset.i18n);
for (const el of document.querySelectorAll("[data-i18n-title]")) el.title = T(el.dataset.i18nTitle);
for (const el of document.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = T(el.dataset.i18nPlaceholder);
