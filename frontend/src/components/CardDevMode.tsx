import { motion } from "motion/react";

import { actionCards, cardBack, numberCards, wildCards, type CardDefinition } from "../game/cards";
import { GameCard } from "./GameCard";

type CardDevModeProps = { onClose: () => void };
type CardGroup = { name: string; description: string; cards: CardDefinition[] };

const groupByFamily = (cards: CardDefinition[]) => {
  const families = new Map<string, CardDefinition[]>();
  for (const card of cards) families.set(card.family, [...(families.get(card.family) ?? []), card]);
  return families;
};

const numberFamilies = groupByFamily(numberCards);
const actionFamilies = groupByFamily(actionCards);
const wildFamilies = groupByFamily(wildCards);

const groups: CardGroup[] = [
  { name: "Number", description: "Every number in all four table colors.", cards: numberFamilies.get("Number") ?? [] },
  ...["Skip", "Reverse", "Draw 2", "Discard All", "Draw 4", "Skip Everyone"].map((name) => ({
    name, description: "Red, yellow, green, and blue variants.", cards: actionFamilies.get(name) ?? [],
  })),
  ...["Wild Draw 6", "Wild Draw 10", "Wild Reverse Draw 4", "Wild Color Roulette"].map((name) => ({
    name, description: "A high-impact No Mercy wild card.", cards: wildFamilies.get(name) ?? [],
  })),
  { name: "Card back", description: "Shared reverse artwork for hidden hands and the draw pile.", cards: [cardBack] },
];

export function CardDevMode({ onClose }: CardDevModeProps) {
  return (
    <motion.main animate={{ opacity: 1, y: 0 }} className="dev-mode" initial={{ opacity: 0, y: 12 }}>
      <header className="dev-mode__header">
        <div>
          <span className="section-kicker">Visual lab / Backend offline</span>
          <h1>Card design system</h1>
          <p>Every unique face is rendered below. Drop matching image files into <code>frontend/src/assets/cards</code> to replace the generated artwork.</p>
        </div>
        <button className="control-button control-button--light" onClick={onClose} type="button"><span aria-hidden="true">←</span> Return to dev mode</button>
      </header>
      <div className="dev-mode__stats">
        <span><b>{numberCards.length + actionCards.length + wildCards.length + 1}</b> unique faces</span>
        <span><b>4</b> core colors</span>
        <span><b>0</b> server calls</span>
      </div>
      <div className="card-catalog">
        {groups.map((group, index) => (
          <section className="card-group" key={group.name}>
            <div className="card-group__heading">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><h3>{group.name}</h3><p>{group.description}</p></div>
            </div>
            <div className="card-group__cards">
              {group.cards.map((card) => (
                <div className="card-specimen" key={card.id}>
                  <GameCard card={card} size="medium" />
                  <code title={card.assetFile}>{card.assetFile}</code>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </motion.main>
  );
}
