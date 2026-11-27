/**
 * Driver cards: before qualifying every player driver gets 3 random cards and picks one.
 * In a season the cards add up race by race.
 */
import { getLang, t } from '../i18n';
import { cardById, cardOffer, type Card, type CarSetup } from '../sim';
import { esc } from '../ui/common';
import { play } from '../ui/assets';

export interface CardsOptions {
  drivers: CarSetup[];
  /** Cards each driver already has (this season). */
  owned: Record<string, string[]>;
  seed: number;
  season: boolean;
  /** Card slot of a driver (see cardOffer); default: its index. */
  slot?: (car: CarSetup, i: number) => number;
}

const cardHTML = (c: Card, driver: string, on: boolean) => {
  const lang = getLang();
  return `<button class="dcard-pick${on ? ' on' : ''}" data-drv="${driver}" data-card="${c.id}">
    <span class="dc-icon">${c.icon}</span>
    <b class="dc-name">${esc(c.name[lang])}</b>
    <small class="dc-eff">${esc(c.effect[lang])}</small>
  </button>`;
};

export function cardsScreen(app: HTMLElement, o: CardsOptions, done: (picks: Record<string, string>) => void): void {
  const offers = new Map(o.drivers.map((d, i) => [d.id, cardOffer(o.seed, o.slot ? o.slot(d, i) : i)]));
  const picks: Record<string, string> = {};
  const render = () => {
    const lang = getLang();
    app.innerHTML = `
      <h1>🃏 ${t('cardsTitle')}</h1>
      <p class="sub">${t(o.season ? 'cardsHintSeason' : 'cardsHintRace')}</p>
      ${o.drivers
        .map((d) => {
          const owned = (o.owned[d.id] ?? []).map((id) => cardById(id)).filter((c): c is Card => !!c);
          return `<div class="panel cards-row" style="border-left:6px solid ${d.color}">
            <div class="cards-drv"><b>#${d.num} ${esc(d.name)}</b>${
              owned.length ? `<span class="cards-owned" title="${esc(owned.map((c) => c.name[lang]).join(', '))}">${owned.map((c) => c.icon).join('')}</span>` : ''
            }</div>
            <div class="cards-offer">${offers.get(d.id)!.map((c) => cardHTML(c, d.id, picks[d.id] === c.id)).join('')}</div>
          </div>`;
        })
        .join('')}
      <button class="big mt" id="cgo" ${o.drivers.every((d) => picks[d.id]) ? '' : 'disabled'}>${t('cardsGo')}</button>`;
    app.querySelectorAll<HTMLButtonElement>('[data-card]').forEach((b) => {
      b.onclick = () => {
        picks[b.dataset.drv!] = b.dataset.card!;
        play('select');
        render();
      };
    });
    (app.querySelector('#cgo') as HTMLButtonElement).onclick = () => done(picks);
  };
  render();
}
