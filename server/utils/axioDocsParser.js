import * as cheerio from 'cheerio';

/**
 * Parses AXIO documentation HTML to extract icon data
 * @param {string} htmlContent - The raw HTML content
 * @returns {Array} Array of icon objects { name, url, keywords }
 */
export const parseAxioIcons = (htmlContent) => {
    try {
        const $ = cheerio.load(htmlContent);
        const icons = [];

        console.log('Parsing AXIO docs HTML...');

        // Strategy: Look for common icon grid patterns
        // 1. Look for elements with class containing 'icon' or 'grid'
        // 2. Look for img/svg tags and their nearest text

        // Generic parser for documentation grids
        $('img').each((i, el) => {
            const $el = $(el);
            const src = $el.attr('src');
            const alt = $el.attr('alt');

            // Skip utility images
            if (!src || src.includes('favicon') || src.includes('logo')) return;

            // Try to find name from alt text or nearby text
            let name = alt;

            if (!name || name.length > 30) {
                // Look at parent text
                const parentText = $el.parent().text().trim();
                if (parentText && parentText.length < 30) {
                    name = parentText;
                } else {
                    // Look at next sibling
                    const nextText = $el.next().text().trim();
                    if (nextText && nextText.length < 30) {
                        name = nextText;
                    }
                }
            }

            if (name) {
                // Clean up name
                name = name.replace(/icon/i, '').trim();

                if (name.length > 1) {
                    icons.push({
                        name: name,
                        url: src,
                        keywords: name.toLowerCase().split(/[\s-_]+/)
                    });
                }
            }
        });

        console.log(`Found ${icons.length} potential icons`);
        return icons;
    } catch (error) {
        console.error('Error parsing AXIO docs:', error);
        return [];
    }
};
