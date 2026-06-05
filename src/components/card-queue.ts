import "./card-queue.css";

export interface CardEntry {
  character: string;
  meaning: string;
}

export type QueueSide = "left" | "right" | "top" | "bottom";

export class CardQueue {
  private container: HTMLDivElement;
  private maxVisibleCards: number;
  private cards: HTMLDivElement[] = [];
  private side: QueueSide;

  constructor(side: QueueSide = "left", maxVisibleCards = 7) {
    this.side = side;
    this.maxVisibleCards = maxVisibleCards;
    this.container = document.createElement("div");
    this.container.className = `card-queue-container ${side}`;
    document.body.appendChild(this.container);
  }

  setMappingMode(enabled: boolean, anchorElement?: HTMLElement) {
    if (enabled && anchorElement) {
      this.container.classList.add("mapping");
      anchorElement.appendChild(this.container);
    } else {
      this.container.classList.remove("mapping");
      document.body.appendChild(this.container);
    }
  }

  setSide(side: QueueSide) {
    this.container.classList.remove(this.side);
    this.side = side;
    this.container.classList.add(side);
  }

  private isHorizontal() {
    return this.side === "top" || this.side === "bottom";
  }

  private getEntryTranslate() {
    if (this.isHorizontal()) {
      return this.side === "top" ? "translateY(-20px)" : "translateY(20px)";
    }
    return this.side === "left" ? "translateX(-20px)" : "translateX(20px)";
  }

  add(entry: CardEntry) {
    const card = document.createElement("div");
    card.className = "card-queue-card";

    const characterEl = document.createElement("div");
    characterEl.className = "card-queue-character";
    characterEl.textContent = entry.character;

    const meaningEl = document.createElement("div");
    meaningEl.className = "card-queue-meaning";
    meaningEl.textContent = entry.meaning;

    card.appendChild(characterEl);
    card.appendChild(meaningEl);

    // Synchronously update list and DOM
    this.container.prepend(card);
    this.cards.unshift(card);

    const fullHeight = card.offsetHeight;
    const fullWidth = card.offsetWidth;
    const moveTranslate = this.getEntryTranslate();
    const horizontal = this.isHorizontal();

    // Entry animation
    card.animate(
      [
        {
          ...(horizontal ? { width: "0px" } : { height: "0px" }),
          opacity: 0,
          transform: `${moveTranslate} scale(0.9)`,
        },
        {
          ...(horizontal ? { width: `${fullWidth}px` } : { height: `${fullHeight}px` }),
          opacity: 1,
          transform: "translate(0, 0) scale(1)",
        },
      ],
      {
        duration: 500,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        fill: "forwards",
      },
    );

    // Handle removal of oldest card if over limit
    if (this.cards.length > this.maxVisibleCards) {
      const oldestCard = this.cards.pop();
      if (oldestCard) {
        const oldWidth = oldestCard.offsetWidth;
        const oldHeight = oldestCard.offsetHeight;
        oldestCard
          .animate(
            [
              {
                opacity: 1,
                transform: "scale(1)",
                ...(horizontal ? { width: `${oldWidth}px` } : { height: `${oldHeight}px` }),
              },
              {
                opacity: 0,
                transform: `scale(0.9) ${moveTranslate}`,
                ...(horizontal ? { width: "0px", marginRight: "0px", paddingLeft: "0px", paddingRight: "0px" } : { height: "0px", marginBottom: "0px" }),
                paddingTop: "0px",
                paddingBottom: "0px",
                borderWidth: "0px",
              },
            ],
            {
              duration: 400,
              easing: "ease-in",
              fill: "forwards",
            },
          )
          .finished.then(() => oldestCard.remove());
      }
    }
  }
}
