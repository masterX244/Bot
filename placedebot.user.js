// ==UserScript==
// @name         PlaceDE Bot
// @namespace    https://github.com/PlaceDE/Bot
// @version      11
// @description  /r/place bot
// @author       NoahvdAa, reckter, SgtChrome, nama17
// @match        https://www.reddit.com/r/place/*
// @match        https://new.reddit.com/r/place/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=reddit.com
// @require	     https://cdn.jsdelivr.net/npm/toastify-js
// @resource     TOASTIFY_CSS https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css
// @updateURL    https://github.com/PlaceDE/Bot/raw/main/placedebot.user.js
// @downloadURL  https://github.com/PlaceDE/Bot/raw/main/placedebot.user.js
// @grant        GM_getResourceText
// @grant        GM_addStyle
// ==/UserScript==

// Sorry voor de rommelige code, haast en clean gaatn iet altijd samen ;)

var placeOrders = [];
var accessToken;
var canvas = document.createElement('canvas');

const VERSION = 11
var UPDATE_PENDING = false;

const COLOR_MAPPINGS = {
	'#FF4500': 2,
	'#FFA800': 3,
	'#FFD635': 4,
	'#00A368': 6,
	'#7EED56': 8,
	'#2450A4': 12,
	'#3690EA': 13,
	'#51E9F4': 14,
	'#811E9F': 18,
	'#B44AC0': 19,
	'#FF99AA': 23,
	'#9C6926': 25,
	'#000000': 27,
	'#898D90': 29,
	'#D4D7D9': 30,
	'#FFFFFF': 31,
	'#BE0039': 32,
	'#00A368': 33,
	'#00CC78': 34,
	'#493AC1': 35,
	'#6A5CFF': 36,
	'#FF3881': 37,
	'#6D482F': 38
};

(async function () {
	GM_addStyle(GM_getResourceText('TOASTIFY_CSS'));
	canvas.width = 2000;
	canvas.height = 1000;
	canvas = document.body.appendChild(canvas);

	Toastify({
		text: 'Abfrage des Zugriffstokens...',
		duration: 10000
	}).showToast();
	accessToken = await getAccessToken();
	Toastify({
		text: 'Zugriffstoken eingesammelt!',
		duration: 10000
	}).showToast();

	setInterval(updateOrders, 5 * 60 * 1000); // Update orders elke vijf minuten.
	await updateOrders();
	attemptPlace();
})();

function shuffleWeighted(array) {
	for (const item of array) {
		item.rndPriority = Math.round(placeOrders.priorities[item.priority] * Math.random());
	}
	array.sort((a, b) => b.rndPriority - a.rndPriority);
}

function getPixelList() {
	const structures = [];
	for (const structureName in placeOrders.structures) {
		shuffleWeighted(placeOrders.structures[structureName].pixels);
		structures.push(placeOrders.structures[structureName]);
	}
	shuffleWeighted(structures);
	return structures.map(structure => structure.pixels).flat();
}

async function attemptPlace() {
	var ctx;
	try {
		const canvasUrl = await getCurrentImageUrl();
		ctx = await getCanvasFromUrl(canvasUrl);
	} catch (e) {
		console.warn('Fehler beim Abrufen der Zeichenfläche:', e);
		Toastify({
			text: 'Fehler beim Abrufen der Zeichenfläche. Neuer Versuch in 15 Sekunden...',
			duration: 10000
		}).showToast();
		setTimeout(attemptPlace, 15000); // probeer opnieuw in 15sec.
		return;
	}

	const pixelList = getPixelList();

	let foundPixel = false;
	let wrongCount = 0;

	for (const order of pixelList) {
		const x = order.x;
		const y = order.y;
		const colorId = COLOR_MAPPINGS[order.color] ?? order.color;

		const rgbaAtLocation = ctx.getImageData(x, y, 1, 1).data;
		const hex = rgbToHex(rgbaAtLocation[0], rgbaAtLocation[1], rgbaAtLocation[2]);
		const currentColorId = COLOR_MAPPINGS[hex];
		// Pixel already set
		if (currentColorId == colorId) continue;
		wrongCount++;

		if (foundPixel) continue;
		foundPixel = true;

		Toastify({
			text: `Pixel wird gesetzt auf ${x}, ${y}...`,
			duration: 10000
		}).showToast();

		const time = new Date().getTime();
		let nextAvailablePixelTimestamp = await place(x, y, colorId) ?? new Date(time + 1000 * 60 * 5 + 1000 * 15)

		// Sanity check timestamp
		if (nextAvailablePixelTimestamp < time || nextAvailablePixelTimestamp > time + 1000 * 60 * 5 + 1000 * 15) {
			nextAvailablePixelTimestamp = time + 1000 * 60 * 5 + 1000 * 15;
		}

		// Add a few random seconds to the next available pixel timestamp
		const waitFor = nextAvailablePixelTimestamp - time + (Math.random() * 1000 * 15);

		const minutes = Math.floor(waitFor / (1000 * 60))
		const seconds = Math.floor((waitFor / 1000) % 60)
		Toastify({
			text: `Warten auf Abkühlzeit ${minutes}:${seconds} bis ${new Date(nextAvailablePixelTimestamp).toLocaleTimeString()}`,
			duration: waitFor
		}).showToast();
		setTimeout(attemptPlace, waitFor);
	}

	if	(foundPixel) {
		console.log( `${wrongCount} sind noch falsch`)
		return
	}

	Toastify({
		text: 'Alle bestellten Pixel haben bereits die richtige Farbe!',
		duration: 10000
	}).showToast();
	setTimeout(attemptPlace, 30000); // probeer opnieuw in 30sec.
}

function updateOrders() {
	fetch(`https://placede.github.io/pixel/pixel.json`, {cache: "no-store"}).then(async (response) => {
		if (!response.ok) return console.warn('Bestellungen können nicht geladen werden!');
		const data = await response.json();

		if (JSON.stringify(data) !== JSON.stringify(placeOrders)) {
			const structureCount = Object.keys(data.structures).length;
			let pixelCount = 0;
			for (const structureName in data.structures) {
				pixelCount += data.structures[structureName].pixels.length;
			}
			Toastify({
				text: `Neue Strukturen geladen. Bilder: ${structureCount} - Pixels: ${pixelCount}.`,
				duration: 10000
			}).showToast();
		}

		if (data?.version !== VERSION && !UPDATE_PENDING) {
			UPDATE_PENDING = true
			Toastify({
				text: `NEUE VERSION VERFÜGBAR! Aktualisiere hier https://github.com/placeDE/Bot/raw/main/placedebot.user.js`,
				duration: -1,
				onClick: () => {
					// Tapermonkey captures this and opens a new tab
					window.location = 'https://github.com/placeDE/Bot/raw/main/placedebot.user.js'
				}
			}).showToast();

		}
		placeOrders = data;
	}).catch((e) => console.warn('Bestellungen können nicht geladen werden!', e));
}

/**
 * Places a pixel on the canvas, returns the "nextAvailablePixelTimestamp", if succesfull
 * @param x
 * @param y
 * @param color
 * @returns {Promise<number>}
 */
async function place(x, y, color) {
	const response = await fetch('https://gql-realtime-2.reddit.com/query', {
		method: 'POST',
		body: JSON.stringify({
			'operationName': 'setPixel',
			'variables': {
				'input': {
					'actionName': 'r/replace:set_pixel',
					'PixelMessageData': {
						'coordinate': {
							'x': x,
							'y': y
						},
						'colorIndex': color,
						'canvasIndex': 0
					}
				}
			},
			'query': `mutation setPixel($input: ActInput!) {
				act(input: $input) {
					data {
						... on BasicMessage {
							id
							data {
								... on GetUserCooldownResponseMessageData {
									nextAvailablePixelTimestamp
									__typename
								}
								... on SetPixelResponseMessageData {
									timestamp
									__typename
								}
								__typename
							}
							__typename
						}
						__typename
					}
					__typename
				}
			}
			`
		}),
		headers: {
			'origin': 'https://hot-potato.reddit.com',
			'referer': 'https://hot-potato.reddit.com/',
			'apollographql-client-name': 'mona-lisa',
			'Authorization': `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		}
	});
	const data = await response.json()
	if (data.errors != undefined) {
		Toastify({
			text: 'Fehler beim Platzieren des Pixels, warte auf Abkühlzeit...',
			duration: 10000
		}).showToast();
		return data.errors[0].extensions?.nextAvailablePixelTs
	}
	return data?.data?.act?.data?.[0]?.data?.nextAvailablePixelTimestamp
}

async function getAccessToken() {
	const usingOldReddit = window.location.href.includes('new.reddit.com');
	const url = usingOldReddit ? 'https://new.reddit.com/r/place/' : 'https://www.reddit.com/r/place/';
	const response = await fetch(url);
	const responseText = await response.text();

	// TODO: ew
	return responseText.split('\"accessToken\":\"')[1].split('"')[0];
}

async function getCurrentImageUrl() {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket('wss://gql-realtime-2.reddit.com/query', 'graphql-ws');

		ws.onopen = () => {
			ws.send(JSON.stringify({
				'type': 'connection_init',
				'payload': {
					'Authorization': `Bearer ${accessToken}`
				}
			}));
			ws.send(JSON.stringify({
				'id': '1',
				'type': 'start',
				'payload': {
					'variables': {
						'input': {
							'channel': {
								'teamOwner': 'AFD2022',
								'category': 'CANVAS',
								'tag': '0'
							}
						}
					},
					'extensions': {},
					'operationName': 'replace',
					'query': `subscription replace($input: SubscribeInput!) {
						subscribe(input: $input) {
							id
							... on BasicMessage {
								data {
									__typename
									... on FullFrameMessageData {
										__typename
										name
										timestamp
									}
								}
								__typename
							}
							__typename
						}
					}
					`
				}
			}));
		};

		ws.onmessage = (message) => {
			const { data } = message;
			const parsed = JSON.parse(data);

			// TODO: ew
			if (!parsed.payload || !parsed.payload.data || !parsed.payload.data.subscribe || !parsed.payload.data.subscribe.data) return;

			ws.close();
			resolve(parsed.payload.data.subscribe.data.name);
		}


		ws.onerror = reject;
	});
}

function getCanvasFromUrl(url) {
	return new Promise((resolve, reject) => {
		var ctx = canvas.getContext('2d');
		var img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			ctx.drawImage(img, 0, 0);
			resolve(ctx);
		};
		img.onerror = reject;
		img.src = url;
	});
}

function rgbToHex(r, g, b) {
	return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}
