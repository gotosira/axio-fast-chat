import fetch from 'node-fetch';

const TOKEN = process.env.FIGMA_ACCESS_TOKEN || "YOUR_FIGMA_ACCESS_TOKEN";
const URL_TO_TEST = "https://www.figma.com/design/EzkHpsrGUZpHuULd8MdOxa/Techsauce---Forecast?node-id=4024-19671&t=nDcaWcXdWWPX0Ade-4";

async function testFigma() {
    console.log("Testing Figma API...");

    // Parse URL
    const urlObj = new URL(URL_TO_TEST);
    const pathParts = urlObj.pathname.split('/');
    let fileKey = null;
    for (let i = 0; i < pathParts.length; i++) {
        if ((pathParts[i] === 'file' || pathParts[i] === 'design') && pathParts[i + 1]) {
            fileKey = pathParts[i + 1];
            break;
        }
    }
    const nodeId = urlObj.searchParams.get('node-id');

    console.log(`File Key: ${fileKey}`);
    console.log(`Node ID: ${nodeId}`);

    if (!fileKey || !nodeId) {
        console.error("Failed to parse URL");
        return;
    }

    const apiUrl = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeId}`;

    try {
        const response = await fetch(apiUrl, {
            headers: {
                "X-Figma-Token": TOKEN
            }
        });

        if (!response.ok) {
            console.error(`API Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(text);
            return;
        }

        const data = await response.json();
        const node = data.nodes[nodeId.replace('-', ':')] || data.nodes[nodeId];

        if (node) {
            console.log("✅ Success! Node found:");
            console.log("Name:", node.document.name);
            console.log("Type:", node.document.type);
            console.log("ID:", node.document.id);
        } else {
            console.error("❌ Node not found in response");
            console.log("Keys:", Object.keys(data.nodes));
        }

    } catch (error) {
        console.error("Fetch error:", error);
    }
}

testFigma();
