import { useEffect, useState } from "react";
import { Timeline } from "vis-timeline/standalone";
import "vis-timeline/styles/vis-timeline-graph2d.css";
import "./App.css";

function App() {
	const [timelineData, setTimelineData] = useState({
		items: [],
	});

	useEffect(() => {
		// Load and process CSV data
		fetch("/src/data.csv")
			.then((response) => response.text())
			.then((data) => {
				const processedData = processCSVData(data);
				setTimelineData(processedData);
			});
	}, []);

	useEffect(() => {
		if (timelineData.items.length === 0) return;

		const container = document.getElementById("timeline");
		const options = {
			height: "80vh",
			zoomable: false,
			moveable: true,
			orientation: "bottom",
			start: new Date(1915, 0, 1),
			end: new Date(),
			showCurrentTime: false,
			showMajorLabels: true,
			showMinorLabels: true,
			format: {
				minorLabels: {
					month: "MMM yyyy",
					year: "yyyy",
				},
				majorLabels: {
					year: "yyyy",
				},
			},
			// Custom stacking options
			stack: true,
			stackSubgroups: false,
			verticalScroll: true,
			horizontalScroll: true,
			// Add more space between items
			margin: {
				item: {
					horizontal: 2,
					vertical: 5,
				},
			},
			// Improve text visibility
			showTooltips: true,
			// Set zoom constraints
			zoomMin: 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
			zoomMax: 1000 * 60 * 60 * 24 * 365 * 60, // 60 years
			// Set initial zoom level (5 years)
			zoomFriction: 10,
		};

		const timeline = new Timeline(container, timelineData.items, null, options);

		// Set initial zoom level to 16454 days
		const initialZoom = 1000 * 60 * 60 * 24 * 13000; // 16454 days in milliseconds
		const initialStart = new Date(1915, 0, 1);
		const initialEnd = new Date(initialStart.getTime() + initialZoom);
		timeline.setWindow(initialStart, initialEnd);

		// Add custom mousewheel handler
		container.addEventListener(
			"wheel",
			(event) => {
				event.preventDefault();
				const window = timeline.getWindow();
				const scrollAmount = window.end - window.start;

				if (event.deltaY < 0) {
					// Scrolling up - move backward in time (earlier)
					timeline.setWindow(
						new Date(window.start.getTime() - scrollAmount),
						new Date(window.end.getTime() - scrollAmount)
					);
				} else {
					// Scrolling down - move forward in time (later)
					timeline.setWindow(
						new Date(window.start.getTime() + scrollAmount),
						new Date(window.end.getTime() + scrollAmount)
					);
				}
			},
			{ passive: false }
		);

		return () => {
			timeline.destroy();
		};
	}, [timelineData]);

	return (
		<div className='app'>
			<h1>Broadway Shows Timeline</h1>
			<div id='timeline'></div>
		</div>
	);
}

function processCSVData(csvText) {
	const lines = csvText.split("\n");
	const items = [];
	const showMap = new Map(); // Track unique shows and their dates

	// Helper function to parse CSV line properly
	function parseCSVLine(line) {
		const result = [];
		let current = '';
		let inQuotes = false;
		
		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			
			if (char === '"') {
				inQuotes = !inQuotes;
			} else if (char === ',' && !inQuotes) {
				result.push(current.trim());
				current = '';
			} else {
				current += char;
			}
		}
		result.push(current.trim());
		return result;
	}

	// Helper function to normalize show titles
	function normalizeShowTitle(title) {
		return title.toLowerCase().trim();
	}

	// First pass: collect all unique shows and their dates
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		const values = parseCSVLine(line);
		
		const show = values[2];
		const isRevival = values[3] === "Revival";
		const startDate = values[4];
		const endDate = values[5];

		// Skip if any required values are missing or empty
		if (!show || !startDate || !endDate) continue;

		// Parse dates with error handling
		let start, end;
		try {
			start = new Date(startDate);
			end = new Date(endDate);
			
			// Check if dates are valid
			if (isNaN(start.getTime())) {
				console.error(`Invalid start date for show "${show}": ${startDate}`);
				continue;
			}
			if (isNaN(end.getTime())) {
				console.error(`Invalid end date for show "${show}": ${endDate}`);
				continue;
			}
		} catch (error) {
			console.error(`Error parsing dates for show "${show}":`, error);
			continue;
		}

		const normalizedShow = normalizeShowTitle(show);
		if (!showMap.has(normalizedShow)) {
			showMap.set(normalizedShow, {
				start,
				end,
				positions: new Set(),
				isRevival,
				originalTitle: show, // Keep the original title for display
			});
		} else {
			const existing = showMap.get(normalizedShow);
			// Update dates if this run is longer
			if (start < existing.start) existing.start = start;
			if (end > existing.end) existing.end = end;
		}
	}

	// Second pass: create timeline items for each unique show
	showMap.forEach((data, normalizedShow) => {
		items.push({
			id: normalizedShow,
			start: data.start,
			end: data.end,
			content: data.originalTitle, // Use the original title for display
			title: `${data.originalTitle}\n${data.start.toLocaleDateString()} to ${data.end.toLocaleDateString()}\n${
				data.isRevival ? "Revival" : "Original Production"
			}`,
			className: `show-item ${data.isRevival ? "revival" : "original"}`,
			// Add custom data for styling
			showType: data.isRevival ? "revival" : "original",
			// Add subgroup for stacking
			subgroup: data.isRevival ? "revival" : "original",
			// Set type to box for automatic width
			type: "box",
		});
	});

	// Sort items by start date
	items.sort((a, b) => a.start - b.start);

	return {
		items,
	};
}

export default App;
