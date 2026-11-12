import { translate, LOCALES } from './translations.js';
const api = globalThis.browser || chrome;
export let locale = 'en';
export const t = (text, values) => translate(text, locale, values);
export const localeTag = () => LOCALES[locale];
export async function initLocale() {
  const saved = await api.storage.local.get('uiLanguage');
  const language = navigator.language.toLowerCase();
  locale = LOCALES[saved.uiLanguage] ? saved.uiLanguage : language.startsWith('pt') ? 'pt_BR' : language.startsWith('zh') ? 'zh_CN' : 'en';
  document.documentElement.lang = localeTag(); document.title = t(document.title);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (['SCRIPT','STYLE','CODE'].includes(node.parentElement?.tagName)) continue;
    const text = node.textContent.trim(); if (text) node.textContent = node.textContent.replace(text, () => t(text));
  }
  for (const el of document.querySelectorAll('[placeholder],[aria-label],[title]')) for (const attr of ['placeholder','aria-label','title']) if (el.hasAttribute(attr)) el.setAttribute(attr,t(el.getAttribute(attr)));
  for (const select of document.querySelectorAll('[data-language]')) { select.value = locale; select.onchange = async () => { await api.storage.local.set({ uiLanguage: select.value }); location.reload(); }; }
  for (const link of document.querySelectorAll('[data-donate]')) {
    const url = new URL('https://www.paypal.com/cgi-bin/webscr');
    url.search = new URLSearchParams({ cmd: '_donations', business: 'jv12802@gmail.com', item_name: t('Desenvolvimento do mBlock'), currency_code: 'BRL', 'locale.x': locale === 'pt_BR' ? 'pt_BR' : locale === 'zh_CN' ? 'zh_CN' : 'en_US' }).toString();
    link.href = url.href;
  }
}
