---
description: "Generate interactive HTML slides from concepts and topics in the Wiki. Includes SVG diagrams and illustrations."
---

# harvest slides — HTML Slide Generation

Generate interactive dark-themed HTML slides from Wiki entries.

## Usage

```
/harvest-slides <wiki entry path or concept name>
```

## Steps

1. **Read**: Wiki entry + sources: raw files + related entries
2. **Design**: Compose 5-12 slides (one point per slide)
3. **Generate**: Single HTML file (inline CSS/JS/SVG)
4. **Save**: `wiki/slides/<kebab-name>.html` → open with `open` to verify

## Slide Types

Title / Definition / Comparison / Flow / Tree / Matrix / Card group / Metaphor / Numeric / Summary

## Design Specifications

- Dark: `#0f0f1a` bg, `#1a1a2e` surface, `#e94560` accent, `#f5c842` gold
- Font: `'Helvetica Neue', 'Hiragino Sans', sans-serif`
- SVG illustrations (no external images), cards with `border-radius: 16px` + hover float
- Responsive (768px)

## Required Features

← → keys, touch swipe, dot indicator, button navigation, translateX+opacity animation

## Content Rules

- Text limited to 3 lines max; diagrams are the main focus
- Preserve original terminology from the source
- Final slide includes links to related slides
