# Card artwork

Finished artwork for all cards in the UNO Show 'Em No Mercy catalog has been extracted from the high-resolution printable card sheets in `frontend/src/assets/combined_images`.

Each card is cropped tightly inside the cutting guidelines to eliminate any white space or divider lines outside the card borders, properly oriented upright, and exported to WebP.

Supported formats are PNG, JPG, WEBP, and SVG; WEBP is the default catalog name. Artwork uses an 83:130 portrait aspect ratio (matching the 166x260 cropped card dimensions). `GameCard` loads a matching image automatically and keeps the same sizing, hand layout, and board behavior.
