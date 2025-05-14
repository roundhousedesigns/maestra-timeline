import { useEffect, useState, useRef } from "react";
import { Timeline } from "vis-timeline/standalone";
import "vis-timeline/styles/vis-timeline-graph2d.css";
import "./App.css";

function App() {
	const [timelineData, setTimelineData] = useState({
		items: [],
	});
	const [selectedShow, setSelectedShow] = useState(null);
	const [isPanelOpen, setIsPanelOpen] = useState(false);
	const [selectedPerson, setSelectedPerson] = useState(null);
	const sidePanelRef = useRef(null);
	const timelineRef = useRef(null);
	const timelineInstanceRef = useRef(null);

	useEffect(() => {
		// Load and process CSV data
		fetch(import.meta.env.VITE_DATA_SOURCE_URL)
			.then((response) => response.text())
			.then((csvText) => {
				const processedData = processCSVData(csvText);
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
			// Disable default tooltips
			showTooltips: false,
			// Set zoom constraints
			zoomMin: 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
			zoomMax: 1000 * 60 * 60 * 24 * 365 * 60, // 60 years
			// Set initial zoom level (5 years)
			zoomFriction: 10,
		};

		const timeline = new Timeline(container, timelineData.items, null, options);
		timelineInstanceRef.current = timeline;

		// Add click handler
		timeline.on("click", (properties) => {
			if (properties.item) {
				const item = timelineData.items.find((i) => i.id === properties.item);
				if (item) {
					setSelectedShow(item);
					setIsPanelOpen(true);
					setSelectedPerson(null);
					// Add selected class to the clicked item
					timeline.setSelection(properties.item);
				}
			}
		});

		return () => {
			timeline.destroy();
		};
	}, [timelineData]);

	// Add click outside handler
	useEffect(() => {
		function handleClickOutside(event) {
			// Check if click is outside both the side panel and the timeline
			if (
				sidePanelRef.current &&
				!sidePanelRef.current.contains(event.target) &&
				timelineRef.current &&
				!timelineRef.current.contains(event.target)
			) {
				setIsPanelOpen(false);
			}
		}

		// Only add the listener if the panel is open
		if (isPanelOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}

		// Cleanup
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isPanelOpen]);

	// Function to handle person click
	const handlePersonClick = (person) => {
		setSelectedPerson(person);
	};

	// Function to handle show click from person's shows list
	const handleShowClick = (showId) => {
		const show = timelineData.items.find((item) => item.id === showId);
		if (show) {
			setSelectedShow(show);
			setSelectedPerson(null);
			// Scroll to the show in the timeline
			timelineInstanceRef.current.moveTo(show.start);
			// Highlight the show
			timelineInstanceRef.current.setSelection(showId);
		}
	};

	// Function to get all shows for a person
	const getPersonShows = (personName) => {
		return timelineData.items.filter((item) =>
			item.people.some((p) => p.name === personName)
		);
	};

	return (
		<div className='app'>
			<div className='timeline-container'>
				<div id='timeline' className='timeline' ref={timelineRef}></div>
				<div
					ref={sidePanelRef}
					className={`side-panel ${isPanelOpen ? "open" : ""}`}
				>
					<button
						className='close-button'
						onClick={() => {
							setIsPanelOpen(false);
							setSelectedPerson(null);
						}}
					>
						×
					</button>
					{selectedPerson ? (
						<div className='person-details'>
							<h2>{selectedPerson.name}</h2>
							<div className='person-info'>
								<p className='position'>{selectedPerson.position}</p>
								{selectedPerson.notes && (
									<p className='notes'>{selectedPerson.notes}</p>
								)}
								<div className='shows-list'>
									<h3>Shows</h3>
									{getPersonShows(selectedPerson.name).map((show, index) => (
										<div
											key={index}
											className='show-link'
											onClick={() => handleShowClick(show.id)}
										>
											<h4>{show.content}</h4>
											<p className='type'>
												{show.showType === "revival"
													? "Revival"
													: "Original Production"}
											</p>
											<p className='dates'>
												{new Date(show.start).toLocaleDateString()} to{" "}
												{new Date(show.end).toLocaleDateString()}
											</p>
										</div>
									))}
								</div>
							</div>
						</div>
					) : (
						selectedShow && (
							<div className='show-details'>
								<h2 className='show-title'>{selectedShow.content}</h2>
								<div className='show-info'>
									<p className='type'>
										{selectedShow.showType === "revival"
											? "Revival"
											: "Original Production"}
									</p>
									<div className='dates'>
										<p className='date'>
											Opened:{" "}
											{new Date(selectedShow.start).toLocaleDateString()}
										</p>
										<p className='date'>
											Closed: {new Date(selectedShow.end).toLocaleDateString()}
										</p>
									</div>
									<div className='people-list'>
										<h3>People</h3>
										{selectedShow.people?.map((person, index) => (
											<div key={index} className='person'>
												<h4
													className='person-name'
													onClick={() => handlePersonClick(person)}
												>
													{person.name}
												</h4>
												<p className='position'>{person.position}</p>
												{person.notes && (
													<p className='notes'>{person.notes}</p>
												)}
											</div>
										))}
									</div>
								</div>
							</div>
						)
					)}
				</div>
			</div>
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
		let current = "";
		let inQuotes = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];

			if (char === '"') {
				inQuotes = !inQuotes;
			} else if (char === "," && !inQuotes) {
				result.push(current.trim());
				current = "";
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
		const isRevival = values[4] === "Revival";
		const startDate = values[5];
		const endDate = values[6];
		const firstName = values[1];
		const lastName = values[0];
		const position = values[8];
		const notes = values[12];

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
				originalTitle: show,
				people: [], // Initialize people array
			});
		}

		const existing = showMap.get(normalizedShow);
		// Update dates if this run is longer
		if (start < existing.start) existing.start = start;
		if (end > existing.end) existing.end = end;

		// Add person to the show's people array
		existing.people.push({
			name: `${firstName} ${lastName}`,
			position,
			notes,
		});
	}

	// Second pass: create timeline items for each unique show
	showMap.forEach((data, normalizedShow) => {
		items.push({
			id: normalizedShow,
			start: data.start,
			end: data.end,
			content: data.originalTitle,
			title: `${
				data.originalTitle
			}\n${data.start.toLocaleDateString()} to ${data.end.toLocaleDateString()}\n${
				data.isRevival ? "Revival" : "Original Production"
			}`,
			className: `show-item ${data.isRevival ? "revival" : "original"}`,
			showType: data.isRevival ? "revival" : "original",
			subgroup: data.isRevival ? "revival" : "original",
			type: "box",
			people: data.people, // Include people data in the timeline item
		});
	});

	// Sort items by start date
	items.sort((a, b) => a.start - b.start);

	return {
		items,
	};
}

export default App;
