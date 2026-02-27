'use client';
import { useState } from 'react';
import styles from './AppInfo.module.css';

interface AgentInfo {
    name: string;
    icon: string;
    color: string;
    description: string;
    prompt: string;
}

const AGENTS: AgentInfo[] = [
    {
        name: 'Strazce',
        icon: '🛡️',
        color: '#2870ED',
        description: 'Kontrola úplnosti fotografické dokumentace — ověřuje, zda sada fotek obsahuje exteriér ze všech stran (s číslem popisným), interiér všech místností, a vedlejší stavby (pokud existují).',
        prompt: `Jsi expert na validaci fotografické dokumentace nemovitostí typu Rodinný dům (RD) pro účely bankovního ocenění.

POVINNÁ FOTODOKUMENTACE:
1) Aktuální barevné fotografie:
   a) EXTERIÉR — pohled na dům ze všech světových stran (přední, zadní, boční), pokud je to možné.
      Na alespoň jedné fotce musí být viditelné číslo popisné (CP).
   b) INTERIÉR — fotografie všech místností:
      - kuchyň, obývací pokoj, ložnice, koupelna, WC, chodba, schodiště, sklep, podkroví a další
   c) VEDLEJŠÍ STAVBY — garáž, stodola, dílna, kůlna apod.
      Vedlejší stavby se fotí POUZE pokud na pozemku existují.

POZNÁMKA: Půdorysy/projektová dokumentace NEJSOU povinné.

KATEGORIE PRO KLASIFIKACI:
- EXTERIER_PREDNI, EXTERIER_ZADNI, EXTERIER_BOCNI, EXTERIER_DETAIL
- EXTERIER_CISLO_POPISNE (fotka s viditelným ČP)
- INTERIER_KUCHYN, INTERIER_OBYVAK, INTERIER_LOZNICE, INTERIER_KOUPELNA
- INTERIER_CHODBA, INTERIER_SKLEP, INTERIER_PODKROVI, INTERIER_OSTATNI
- VEDLEJSI_STAVBA, OKOLI, PUDORYS

RIZIKA:
- Chybějící hlavní místnosti → riziko STŘEDNÍ (tolerance u velkých domů)
- Chybějící číslo popisné → WARN
- Chybějící přední pohled → FAIL
- Vedlejší stavba viditelná ale nezdokumentovaná → WARN`,
    },
    {
        name: 'ForenzniAnalytik',
        icon: '🔬',
        color: '#dc2626',
        description: 'Detekce manipulace fotografií — analýza EXIF dat (datum, GPS, zařízení), detekce AI generovaných obrázků, kontrola úprav a nekonzistencí.',
        prompt: `Jsi forenzní expert na analýzu digitálních fotografií.

Tvým úkolem je analyzovat přiložené fotky a detekovat:
1. Manipulace a úpravy (Photoshop, filtry, ořez)
2. AI generované nebo syntetické obrázky
3. Nekonzistentní metadata (EXIF) — rozdílné fotoaparáty, podezřelá data
4. Stopy po klonování nebo retušování
5. Neprirodzené osvětlení nebo stíny

Pro každou fotografii vrať skóre manipulace (0.0-1.0) a komentář.`,
    },
    {
        name: 'Inspektor',
        icon: '🔍',
        color: '#059669',
        description: 'Vizuální inspektor — hodnotí technický stav nemovitosti z fotek: fasáda, střecha, okna, podlahy, vnitřní vybavení.',
        prompt: `Jsi odborný inspektor nemovitostí. Z fotografií ohodnoť technický stav RD.

HODNOŤ:
1. Fasáda — praskliny, vlhkost, omítka
2. Střecha — stav krytiny, okapy
3. Okna — materiál, stav, izolace
4. Interiér — podlahy, stěny, stropy
5. Koupelna — stáří, stav obkladů
6. Kuchyně — stav vybavení
7. Celkový stav konstrukce

Výstup: celkové hodnocení stavu (výborný/dobrý/uspokojivý/špatný) + detaily.`,
    },
    {
        name: 'PorovnavacDokumentu',
        icon: '📋',
        color: '#7c3aed',
        description: 'Porovnání dat z formuláře s fotodokumentací — kontrola počtu podlaží (NEJČASTĚJŠÍ CHYBA!), podkroví, plochy, střechy, stavu, podsklepení.',
        prompt: `Jsi expert na validaci nemovitostí. Porovnej údaje z formuláře s fotodokumentací.

═══════════════════════════════════════════
POČET PODLAŽÍ — NEJDŮLEŽITĚJŠÍ KONTROLA (častá chyba!)
═══════════════════════════════════════════

PRAVIDLA PRO POČÍTÁNÍ PODLAŽÍ:
- 1NP (přízemí) = vždy se počítá
- 2NP (patro) = plné nadzemní podlaží se svislými stěnami
- Podkroví (obytné) = střešní okna, vikýře → POČÍTÁ se jako podlaží
- Půda (neobytná) = bez oken → NEPOČÍTÁ se
- Suterén/sklep = podzemní podlaží

ČASTÉ CHYBY:
- Deklarováno „2 podlaží" ale fotka ukazuje 1NP + podkroví
- Deklarováno „1 podlaží" ale fotka ukazuje přízemí + celé patro
- Podkroví s vikýři ale neuvedeno v podlažích

JAK POZNAT Z FOTEK:
- Počítej ŘADY OKEN nad sebou
- Okna ve střeše = podkroví
- Okna pod terénem = suterén
- Šikmé stropy na interiéru = podkroví

Dále kontroluj: plochu (±20%), střechu, stav, podsklepení, vytápění.`,
    },
    {
        name: 'GeoValidator',
        icon: '📍',
        color: '#ea580c',
        description: 'Ověření lokality — porovnání GPS z EXIF s adresou, vizuální shoda s panoramatem Mapy.cz, kontrola přístupové cesty.',
        prompt: `Jsi expert na geolokační validaci nemovitostí.

ÚKOLY:
1. Extrahuj GPS souřadnice z EXIF dat fotografií
2. Porovnej GPS pozici s deklarovanou adresou (Mapy.cz geocoding)
3. Vizuálně porovnej nahrané fotky s panoramatem z Mapy.cz
4. Ověř přístup k nemovitosti (veřejná cesta, služebnost)

VERDIKTY:
- SHODA: GPS odpovídá adrese, vizuální shoda
- NESHODA: GPS daleko od adresy nebo vizuální neshoda
- NEDOSTATEK_DAT: chybí GPS v EXIF`,
    },
    {
        name: 'KatastralniAnalytik',
        icon: '🏛️',
        color: '#0891b2',
        description: 'Katastrální analýza — stažení dat z ČÚZK (LV, parcely, vlastníci, zástavní práva), ortofoto s katastrální mapou, detekce nezakreslených staveb.',
        prompt: `Jsi expert na analýzu leteckých snímků pro bankovní ocenění.

DETEKCE NEZAKRESLENÝCH STAVEB:
1. Vedlejší stavba > 45 m²:
   → RIZIKO STŘEDNÍ: „Nezakreslená vedlejší stavba nad 45 m² – podmínka zákresu do KN"

2. Přístavba k hlavní stavbě > 16 m²:
   → RIZIKO STŘEDNÍ: „Nezakreslená přístavba nad 16 m² – podmínka zákresu do KN"

Ortofoto se stahuje z ČÚZK WMS s katastrální mapou:
- Žluté hranice parcel (katastr styl)
- Žlutá čísla parcel
- Cyan výplň pro parcely funkčního celku (flood-fill)

LV ANALÝZA — RIZIKA PRO BANKU:
- Zástavní práva, věcná břemena, zákazy zcizení
- Exekuce/insolvence, plomby (probíhající řízení)
- Spoluvlastnictví, BPEJ/zemědělský půdní fond`,
    },
    {
        name: 'Strateg',
        icon: '🎯',
        color: '#4f46e5',
        description: 'Strategické vyhodnocení — agregace výsledků všech agentů, celkový verdikt (SCHVÁLENO / S VÝHRADAMI / ZAMÍTNUTO), identifikace blokujících rizik.',
        prompt: `Jsi hlavní strateg pro vyhodnocení online ocenění rodinných domů.

Dostáváš výsledky od všech agentů. Tvým úkolem je:
1. Agregovat rizika z jednotlivých agentů
2. Určit celkový verdikt: SCHVÁLENO / S VÝHRADAMI / ZAMÍTNUTO
3. Identifikovat blokující rizika (zastavení procesu)
4. Doporučit další kroky

BLOKUJÍCÍ RIZIKA (= ZAMÍTNUTO):
- Podezření na manipulaci fotografií
- Zásadní neshoda formuláře a fotodokumentace
- Exekuce nebo insolvence na nemovitosti
- Chybějící klíčová dokumentace

RIZIKA S VÝHRADAMI:
- Drobné nesrovnalosti v datech
- Chybějící některé fotografie
- Nezakreslené stavby v katastru`,
    },
];

const TECH_STACK = [
    { category: 'Frontend', items: ['Next.js 15 (App Router)', 'React 19', 'TypeScript', 'CSS Modules', 'WebSocket (real-time)'] },
    { category: 'Backend', items: ['Python 3.14 + FastAPI', 'WebSocket streaming', 'Pillow (image processing)', 'httpx (async HTTP)'] },
    { category: 'AI / ML', items: ['Google Gemini 2.0 Flash', 'Multi-modal prompty (text + obrázky)', 'Structured JSON output'] },
    { category: 'Data Sources', items: ['ČÚZK WMS (ortofoto + katastrální mapa)', 'ČÚZK Nahlížení do KN (LV data)', 'Mapy.cz API (geocoding + panorama)'] },
    { category: 'Hosting', items: ['Vercel (frontend)', 'Render.com (backend)', 'GitHub (CI/CD)'] },
];

export default function AppInfo({ onClose }: { onClose: () => void }) {
    const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.modalHeader}>
                    <div>
                        <h2 className={styles.modalTitle}>O aplikaci</h2>
                        <p className={styles.modalSubtitle}>Kontrola vstupních dat pro online ocenění RD</p>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>✕</button>
                </div>

                <div className={styles.modalBody}>
                    {/* Architecture overview */}
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <span className={styles.sectionIcon}>⚙️</span>
                            Architektura
                        </h3>
                        <p className={styles.sectionDesc}>
                            Aplikace implementuje <strong>multi-agentní pipeline</strong> — sérii specializovaných AI agentů,
                            kteří postupně analyzují fotografickou dokumentaci a podkladové dokumenty rodinného domu.
                            Každý agent má specifický prompt a roli. Agenti běží <strong>sekvenčně</strong> (kvůli
                            paměťovým limitům free-tier hostingu) a výsledky streamují přes <strong>WebSocket</strong> v reálném čase.
                        </p>
                        <div className={styles.techGrid}>
                            {TECH_STACK.map((cat) => (
                                <div key={cat.category} className={styles.techCard}>
                                    <div className={styles.techCategory}>{cat.category}</div>
                                    <ul className={styles.techList}>
                                        {cat.items.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Agents */}
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <span className={styles.sectionIcon}>🤖</span>
                            Agenti a jejich prompty
                        </h3>
                        <p className={styles.sectionDesc}>
                            Kliknutím na agenta zobrazíte jeho plný system prompt. Prompty lze upravit v souborech
                            <code>backend/agents/*.py</code>.
                        </p>
                        <div className={styles.agentList}>
                            {AGENTS.map((agent) => (
                                <div key={agent.name} className={styles.agentItem}>
                                    <button
                                        className={styles.agentHeader}
                                        onClick={() => setExpandedAgent(expandedAgent === agent.name ? null : agent.name)}
                                        style={{ borderLeftColor: agent.color }}
                                    >
                                        <div className={styles.agentMeta}>
                                            <span className={styles.agentIcon}>{agent.icon}</span>
                                            <div>
                                                <div className={styles.agentName}>{agent.name}</div>
                                                <div className={styles.agentDesc}>{agent.description}</div>
                                            </div>
                                        </div>
                                        <span className={styles.agentChevron}>
                                            {expandedAgent === agent.name ? '▲' : '▼'}
                                        </span>
                                    </button>
                                    {expandedAgent === agent.name && (
                                        <div className={styles.agentPrompt}>
                                            <div className={styles.promptLabel}>System Prompt:</div>
                                            <pre className={styles.promptCode}>{agent.prompt}</pre>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Pipeline flow */}
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <span className={styles.sectionIcon}>🔄</span>
                            Pipeline
                        </h3>
                        <div className={styles.pipelineFlow}>
                            {AGENTS.map((agent, i) => (
                                <div key={agent.name} className={styles.pipelineStep}>
                                    <div className={styles.pipelineNum} style={{ background: agent.color }}>{i + 1}</div>
                                    <span>{agent.icon} {agent.name}</span>
                                    {i < AGENTS.length - 1 && <span className={styles.pipelineArrow}>→</span>}
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
