// AniList GraphQL API endpoint
const ANILIST_API_URL = 'https://graphql.anilist.co';

// List of anime titles to fetch
const ANIME_TITLES = [
    "City the Animation",
    "Bad Girl",
    "My Dress-Up Darling Season 2",    
    "Dandadan Season 2",
    "Rent-a-Girlfriend Season 4",
];

// Delay between API requests in milliseconds to avoid rate limiting (e.g., 1 second)
const DELAY_BETWEEN_REQUESTS_MS = 1000; // 1 second

/**
 * Fetches anime details from the AniList GraphQL API.
 * @param {string} animeTitle - The title of the anime to search for.
 * @returns {Promise<Object|null>} A promise that resolves with the anime data from AniList, or null if not found/error.
 */
async function fetchAnimeDetails(animeTitle) {
    // MODIFIED: Added 'siteUrl' to the query
    const query = `
        query ($search: String) {
            Media(search: $search, type: ANIME) {
                title {
                    english
                    romaji
                    native
                }
                coverImage {
                    large
                }
                season
                seasonYear
                startDate {
                    year
                    month
                    day
                }
                episodes
                status
                siteUrl # <--- Added this line
                nextAiringEpisode {
                    airingAt
                    episode
                    timeUntilAiring
                }
            }
        }
    `;

    const variables = {
        search: animeTitle
    };

    try {
        const response = await fetch(ANILIST_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                variables: variables
            })
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error(`AniList API Error for "${animeTitle}" (Status: ${response.status}):`, errorBody);
            if (response.status === 429) {
                throw new Error(`Rate limit hit for "${animeTitle}". Please wait and try again.`);
            }
            return null;
        }

        const data = await response.json();
        return data.data.Media;

    } catch (error) {
        console.error(`Error fetching from AniList API for "${animeTitle}":`, error);
        return null;
    }
}

/**
 * Maps AniList season enum to a readable string.
 * @param {string} seasonEnum - The season enum (e.g., 'FALL', 'SUMMER').
 * @returns {string} The formatted season string (e.g., 'Fall').
*/
function formatSeason(seasonEnum) {
    if (!seasonEnum) return '';
    return seasonEnum.charAt(0).toUpperCase() + seasonEnum.slice(1).toLowerCase();
}

/**
 * Formats time in seconds into a human-readable duration.
 * @param {number} totalSeconds - The total number of seconds.
 * @returns {string} Formatted duration string.
 */
function formatTimeUntilAiring(totalSeconds) {
    if (totalSeconds < 0) return 'Already aired';
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (parts.length === 0 && seconds >= 0) parts.push(`${seconds}s`); // Show seconds if nothing else, for very short times

    return parts.join(' ') || 'Soon';
}

/**
 * Calculates and formats anime schedule details, including IST times and next episode info.
 * @param {Object} animeData - The raw anime data from the AniList API.
 * @returns {Object} Formatted schedule details.
 */
function getAnimeSchedule(animeData) {
    const { title, coverImage, season, seasonYear, startDate, nextAiringEpisode, episodes, status, siteUrl } = animeData;

    const englishName = title.english || title.romaji || title.native || 'Unknown Title';
    const coverImageUrl = coverImage.large || 'https://placehold.co/400x600/1a202c/e2e8f0?text=Image+Not+Available';

    const seasonAndYear = `${formatSeason(season)} ${seasonYear || ''}`.trim();

    let isComingSoon = false; 

    let nextEpisodeInfo = "Series information not available.";
    let timeUntilNextEpisode = "N/A";
    let nextEpisodeNumber = "N/A";

    if (nextAiringEpisode) {
        const nextAiringTimestampMs = nextAiringEpisode.airingAt * 1000;
        const nextAiringDate = new Date(nextAiringTimestampMs);

        timeUntilNextEpisode = formatTimeUntilAiring(nextAiringEpisode.timeUntilAiring);
        nextEpisodeNumber = nextAiringEpisode.episode;

        const nextAirDateIST = nextAiringDate.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            month: 'short',
            day: 'numeric',
            weekday: 'short', // Added weekday
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        // MODIFIED: Changed the format string for nextEpisodeInfo
        nextEpisodeInfo = `Ep ${nextEpisodeNumber} on ${nextAirDateIST} IST (${timeUntilNextEpisode})`;
    } else if (status === 'FINISHED') {
        nextEpisodeInfo = "Series has concluded.";
    } else if (status === 'NOT_YET_RELEASED' || isComingSoon) {
        nextEpisodeInfo = "Not yet aired.";
    } else if (episodes && episodes > 0) {
        nextEpisodeInfo = "Series has likely concluded.";
    }

    return {
        englishName: englishName,
        coverImage: coverImageUrl,
        seasonAndYear: seasonAndYear,
        nextEpisodeInfo: nextEpisodeInfo,
        nextEpisodeNumber: nextEpisodeNumber,
        timeUntilNextEpisode: timeUntilNextEpisode,
        isComingSoon: isComingSoon,
        siteUrl: siteUrl
    };
}

/**
 * Creates an HTML string for a single anime card with enhanced UI.
 * @param {Object} anime - Formatted anime data.
 * @returns {string} HTML string for the anime card.
 */
function createAnimeCardHTML(anime) {
    const nextEpisodeDisplay = anime.nextEpisodeInfo.includes("Ep")
        ? `<div class="info-section next-episode-info">
            <i class="fas fa-clock mr-2"></i>
            <span class="value">${anime.nextEpisodeInfo}</span>
           </div>`
        : `<div class="info-section">
            <i class="fas fa-info-circle mr-2"></i>
            <span class="value">${anime.nextEpisodeInfo}</span>
           </div>`;

    const siteUrlDisplay = anime.siteUrl
        ? `<div class="info-section">
            <i class="fas fa-external-link-alt mr-2"></i>
            <a href="${anime.siteUrl}" target="_blank" rel="noopener noreferrer" class="value text-purple-300 hover:underline">
                Anilist
            </a>
           </div>`
        : `<div class="info-section">
            <i class="fas fa-external-link-alt mr-2"></i>
            <span class="value text-gray-400">Not Available</span>
           </div>`;

    return `
        <div class="anime-card rounded-2xl shadow-xl p-5 flex flex-col items-center text-center">
            ${''} 
            <img src="${anime.coverImage}" alt="${anime.englishName} Cover" class="w-full object-cover rounded-lg mb-4 shadow-lg border-2 border-transparent">
            <h3 class="text-3xl font-poppins font-bold mb-2 leading-tight">${anime.englishName}</h3>
            
            <div class="text-sm space-y-3 w-full">
                ${nextEpisodeDisplay} 
                
                ${siteUrlDisplay}
            </div>
        </div>
    `;
}

/**
 * Displays all fetched and formatted anime details on the page.
 * @param {Array<Object>} allAnimeDetails - An array of formatted anime data.
 */
function displayAllAnimeDetails(allAnimeDetails) {
    const animeListContainer = document.getElementById('anime-list-container');
    animeListContainer.innerHTML = ''; // Clear previous content

    if (allAnimeDetails.length === 0) {
        animeListContainer.innerHTML = '<p class="text-xl font-inter text-gray-400 text-center col-span-full">No anime details found for the requested titles. Try adding more!</p>';
    } else {
        allAnimeDetails.forEach(anime => {
            animeListContainer.innerHTML += createAnimeCardHTML(anime);
        });
    }

    document.getElementById('loading').classList.add('hidden');
    document.getElementById('anime-list-container').classList.remove('hidden');
}

/**
 * Utility function to introduce a delay.
 * @param {number} ms - The delay in milliseconds.
 * @returns {Promise<void>} A promise that resolves after the specified delay.
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Initializes the application by fetching and displaying anime details for all specified titles.
 */
async function initApp() {
    const loadingElement = document.getElementById('loading');
    const animeListContainer = document.getElementById('anime-list-container');
    const errorMessageElement = document.getElementById('error-message');

    loadingElement.classList.remove('hidden');
    animeListContainer.classList.add('hidden');
    errorMessageElement.classList.add('hidden');

    const fetchedAnimeData = [];
    let hasError = false;

    for (let i = 0; i < ANIME_TITLES.length; i++) {
        const title = ANIME_TITLES[i];
        try {
            const animeData = await fetchAnimeDetails(title);
            if (animeData) {
                const formattedData = getAnimeSchedule(animeData);
                fetchedAnimeData.push(formattedData);
            } else {
                console.error(`Could not find details for "${title}".`);
                hasError = true;
            }
        } catch (error) {
            console.error(`Failed to fetch details for "${title}":`, error.message);
            hasError = true;
        }

        if (i < ANIME_TITLES.length - 1) {
            await delay(DELAY_BETWEEN_REQUESTS_MS);
        }
    }

    if (hasError) {
        errorMessageElement.classList.remove('hidden');
    }

    displayAllAnimeDetails(fetchedAnimeData);
}

// Run the initialization function when the window loads
window.onload = initApp;
