# Score Breakdown Accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maak elke pijler-balk in het analyse-paneel klikbaar zodat een accordion opent met de individuele criteria-scores en detail-strings.

**Architecture:** Alleen `app/page.tsx` wijzigt. `PijlerBar` krijgt een `criteria` prop en eigen open/dicht state. `Card` bouwt de criteria-lijsten op uit `analysis.checks`. De bestaande kleine detail-regel onderaan wordt verwijderd.

**Tech Stack:** React (useState), TypeScript, Tailwind CSS

---

## File map

| Bestand | Wijziging |
|---------|-----------|
| `app/page.tsx` | Voeg `Criterium` interface toe, voeg `humanDetail` helper toe, pas `PijlerBar` aan, pas `Card` aan |

---

### Task 1: Voeg `Criterium` interface en `humanDetail` helper toe

**Files:**
- Modify: `app/page.tsx` (bovenaan, na de bestaande `ManualScore` interface)

- [ ] **Stap 1: Voeg de `Criterium` interface toe**

Voeg dit toe in `app/page.tsx` direct na de `ManualScore` interface (na regel 10):

```ts
interface Criterium {
  label: string;
  score: number;
  max: number;
  detail?: string;
}
```

- [ ] **Stap 2: Voeg de `humanDetail` helper toe**

Voeg dit toe direct boven de `ScoreRing` component (voor regel 37):

```ts
function humanDetail(s: string): string {
  return s.replace(/_/g, ' ');
}
```

- [ ] **Stap 3: Verifieer TypeScript**

```bash
cd C:\Users\danie\.vscode\restaurant-scanner
npx tsc --noEmit
```

Verwacht: geen fouten.

- [ ] **Stap 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add Criterium interface and humanDetail helper"
```

---

### Task 2: Pas `PijlerBar` aan naar klikbare accordion

**Files:**
- Modify: `app/page.tsx` — vervang de `PijlerBar` functie (regels 71-84)

- [ ] **Stap 1: Vervang de volledige `PijlerBar` functie**

De huidige `PijlerBar` (regels 71-84) vervangen door:

```tsx
function PijlerBar({ label, score, max, criteria }: {
  label: string; score: number; max: number; criteria: Criterium[];
}) {
  const [open, setOpen] = useState(false);
  const pct = Math.round((score / max) * 100);
  const color = pct >= 70 ? "#059669" : pct >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div>
      <div className="flex items-center gap-2 cursor-pointer select-none"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}>
        <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
        <div className="flex-1 h-1.5 bg-[#1f2937] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: color }}/>
        </div>
        <span className="text-xs font-mono text-gray-400 w-10 text-right">{score}/{max}</span>
        <span className="text-[10px] text-gray-600 w-3 text-center">{open ? '▴' : '▾'}</span>
      </div>
      {open && (
        <div className="mt-1.5 pl-3 border-l border-[#1e2028] flex flex-col gap-1">
          {criteria.map(c => {
            const cPct = c.max > 0 ? Math.round((c.score / c.max) * 100) : 0;
            const cColor = cPct >= 70 ? "#059669" : cPct >= 40 ? "#f59e0b" : "#ef4444";
            return (
              <div key={c.label} className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500 w-20 shrink-0">{c.label}</span>
                <div className="w-16 h-1 bg-[#1f2937] rounded-full overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{ width: `${cPct}%`, background: cColor }}/>
                </div>
                <span className="text-[11px] font-mono text-gray-500 w-8 text-right">
                  {c.score}/{c.max}
                </span>
                {c.detail && (
                  <span className="text-[11px] text-gray-600 font-mono ml-1">
                    {humanDetail(c.detail)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Stap 2: Verifieer TypeScript**

```bash
npx tsc --noEmit
```

Verwacht: foutmelding dat `criteria` prop ontbreekt bij de aanroepen in `Card` — dat lossen we op in Task 3.

- [ ] **Stap 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: make PijlerBar an expandable accordion"
```

---

### Task 3: Pas `Card` aan — stuur criteria door en verwijder oude detail-regel

**Files:**
- Modify: `app/page.tsx` — de vier `<PijlerBar>` aanroepen (regels 167-170) en de detail-regel (regels 175-177)

- [ ] **Stap 1: Vervang de vier `<PijlerBar>` aanroepen**

De huidige vier regels (167-170):

```tsx
<PijlerBar label="Inhoud" score={a.pijlers.inhoud} max={45}/>
<PijlerBar label="Conversie" score={a.pijlers.conversie} max={25}/>
<PijlerBar label="UX" score={a.pijlers.ux} max={20}/>
<PijlerBar label="Techniek" score={a.pijlers.tech} max={10}/>
```

Vervangen door:

```tsx
<PijlerBar label="Inhoud" score={a.pijlers.inhoud} max={45} criteria={[
  { label: 'Menu', score: a.checks.menuScore, max: 15, detail: a.checks.menuDetail },
  { label: 'Adres', score: a.checks.adresScore, max: 10 },
  { label: 'Tijden', score: a.checks.tijdenScore, max: 10 },
  { label: "Foto's", score: a.checks.fotoScore, max: 5 },
  { label: 'Verhaal', score: a.checks.verhaalScore, max: 5 },
]}/>
<PijlerBar label="Conversie" score={a.pijlers.conversie} max={25} criteria={[
  { label: 'Reservering', score: a.checks.reserveringScore, max: 12, detail: a.checks.reserveringDetail },
  { label: 'Telefoon', score: a.checks.telefoonScore, max: 8 },
  { label: 'E-mail', score: a.checks.emailScore, max: 5 },
]}/>
<PijlerBar label="UX" score={a.pijlers.ux} max={20} criteria={[
  { label: 'Mobiel', score: a.checks.mobileScore, max: 10, detail: a.checks.mobileDetail },
  { label: 'Snelheid', score: a.checks.speedScore, max: 7, detail: `${a.checks.lcpMs}ms` },
  { label: 'Dead links', score: a.checks.deadLinkScore, max: 3 },
]}/>
<PijlerBar label="Techniek" score={a.pijlers.tech} max={10} criteria={[
  { label: 'HTTPS', score: a.checks.httpsScore, max: 5 },
  { label: 'Meta desc.', score: a.checks.metaDescScore, max: 3 },
  { label: 'Structured', score: a.checks.structuredScore, max: 2 },
]}/>
```

- [ ] **Stap 2: Verwijder de oude detail-regel**

Verwijder deze drie regels (na de totaal-rij, rond regel 175-177):

```tsx
<div className="text-[10px] text-gray-600 font-mono mt-1">
  Menu: {a.checks.menuDetail} · Reservering: {a.checks.reserveringDetail} · LCP: {a.checks.lcpMs}ms
</div>
```

- [ ] **Stap 3: Verifieer TypeScript**

```bash
npx tsc --noEmit
```

Verwacht: geen fouten.

- [ ] **Stap 4: Start de dev server en test handmatig**

```bash
npm run dev
```

Controleer in de browser:
1. Scan een regio en analyseer een restaurant.
2. Klik de kaart open → je ziet de vier pijler-balken met een `▾` pijltje.
3. Klik op "Inhoud" → accordion opent met 5 criteria (menu t/m verhaal) elk met score/max en detail indien beschikbaar.
4. Klik nogmaals → accordion sluit.
5. Klik op "Conversie" → toont reservering (met detail), telefoon, e-mail.
6. Klik op "UX" → toont mobiel (met detail), snelheid (met LCP in ms), dead links.
7. Klik op "Techniek" → toont HTTPS, meta desc., structured.
8. Klik op de kaart-header terwijl een accordion open is → kaart klapt dicht, accordion state reset (normaal gedrag React).
9. De kleine detail-regel (`Menu: · Reservering: · LCP:`) is verdwenen.

- [ ] **Stap 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: show per-criteria score breakdown in PijlerBar accordion"
```
