import fs from 'fs/promises';
import path from 'path';

/**
 * Search for icons in the local AXIO index
 * @param {string} query - Search query
 * @returns {Promise<Array>} Matching icons
 */
export async function searchAxioIcons(query) {
    try {
        const iconPath = path.join(process.cwd(), 'documents/flowflow/axio_icons.json');

        // Check if index exists
        try {
            await fs.access(iconPath);
        } catch {
            return []; // Index doesn't exist yet
        }

        const content = await fs.readFile(iconPath, 'utf-8');
        const icons = JSON.parse(content);

        const lowerQuery = query.toLowerCase();
        // Simple fuzzy search
        const matches = icons.filter(icon =>
            icon.name.toLowerCase().includes(lowerQuery) ||
            icon.keywords.some(k => k.includes(lowerQuery))
        );

        // Sort by relevance (exact match first)
        matches.sort((a, b) => {
            const aExact = a.name.toLowerCase() === lowerQuery;
            const bExact = b.name.toLowerCase() === lowerQuery;
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            return 0;
        });

        return matches.slice(0, 10); // Return top 10
    } catch (error) {
        console.warn('Icon search failed:', error.message);
        return [];
    }
}
