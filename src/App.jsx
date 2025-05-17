import { useEffect, useState, useRef } from "react";
import { Timeline } from "vis-timeline/standalone";
import "vis-timeline/styles/vis-timeline-graph2d.css";
import "./App.css";

function App() {
	const [timelineData, setTimelineData] = useState({
		items: [],
		groups: [],
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
			height: "60vh",
			zoomable: true,
			moveable: true,
			orientation: "bottom",
			start: new Date(1910, 0, 1),
			end: new Date(new Date().getFullYear() + 5, 11, 31),
			min: new Date(1910, 0, 1),
			max: new Date(new Date().getFullYear() + 2, 11, 31),
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
			// Enable vertical stacking
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
			zoomMin: 1000 * 60 * 60 * 24 * 365 * 3, // 3 years
			zoomMax: 1000 * 60 * 60 * 24 * 365 * 30, // 30 years
			zoomFriction: 10,
			// Enable group height adjustment
			groupHeightMode: "auto",
		};

		const timeline = new Timeline(
			container,
			timelineData.items,
			timelineData.groups,
			options
		);
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

	// Add this function near your other handler functions
	const handleShowNavigation = (direction) => {
		// Get all shows sorted by opening date
		const sortedShows = [...timelineData.items].sort(
			(a, b) => new Date(a.start) - new Date(b.start)
		);

		// Find current show's index
		const currentIndex = sortedShows.findIndex(
			(show) => show.id === selectedShow.id
		);

		// Calculate new index
		const newIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;

		// Check if new index is valid
		if (newIndex >= 0 && newIndex < sortedShows.length) {
			const newShow = sortedShows[newIndex];
			setSelectedShow(newShow);
			// Scroll to the show in the timeline
			timelineInstanceRef.current.moveTo(newShow.start);
			// Highlight the show
			timelineInstanceRef.current.setSelection(newShow.id);
		}
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
											<p
												className={`type ${
													show.isRevival ? "revival" : "original"
												}`}
											>
												{!show.isRevival
													? "Original Production"
													: show.isRevival
															.toLowerCase()
															.replace(/\b[a-z]/g, function (letter) {
																return letter.toUpperCase();
															})}
											</p>
											<div className='dates'>
												<p className='date'>
													Opened: {new Date(show.start).toLocaleDateString()}
												</p>
												<p className='date'>
													Closed: {new Date(show.end).toLocaleDateString()}
												</p>
											</div>
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
									<p
										className={`type ${
											selectedShow.isRevival ? "revival" : "original"
										}`}
									>
										{!selectedShow.isRevival
											? "Original Production"
											: selectedShow.isRevival
													.toLowerCase()
													.replace(/\b[a-z]/g, function (letter) {
														return letter.toUpperCase();
													})}
									</p>
									<div className='dates'>
										<p className='date'>
											Opened:{" "}
											{new Date(selectedShow.start).toLocaleDateString()}
										</p>
										<p className='date'>
											Closed: {new Date(selectedShow.end).toLocaleDateString()}
										</p>
										{selectedShow.performances && (
											<p className='date'>
												Performances: {selectedShow.performances}
											</p>
										)}
									</div>
									<div className='people-list'>
										<h3>People</h3>
										{(() => {
											// Group people by name
											const peopleMap = new Map();
											selectedShow.people?.forEach((person) => {
												if (!peopleMap.has(person.name)) {
													peopleMap.set(person.name, {
														name: person.name,
														positions: [],
														notes: person.notes,
													});
												}
												if (person.position) {
													peopleMap.get(person.name).positions.push({
														position: person.position,
														start: person.positionStart
															? new Date(person.positionStart)
															: null,
														end: person.positionEnd
															? new Date(person.positionEnd)
															: null,
													});
												}
											});

											// Sort positions by start date (reverse chronological)
											peopleMap.forEach((person) => {
												person.positions.sort((a, b) => {
													if (!a.start && !b.start) return 0;
													if (!a.start) return 1;
													if (!b.start) return -1;
													return b.start - a.start;
												});
											});

											return Array.from(peopleMap.values()).map(
												(person, index) => (
													<div key={index} className='person'>
														<h4
															className='person-name'
															onClick={() => handlePersonClick(person)}
														>
															{person.name}
														</h4>
														{person.positions.map((pos, posIndex) => (
															<div key={posIndex}>
																<p className='position'>{pos.position}</p>
																{pos.start && (
																	<p className='dates'>
																		{pos.end &&
																		!isNaN(pos.end.toLocaleDateString()) ? (
																			<>
																				{pos.start.toLocaleDateString()} to{" "}
																				{pos.end.toLocaleDateString()}
																			</>
																		) : (
																			<>
																				Start: {pos.start.toLocaleDateString()}
																			</>
																		)}
																	</p>
																)}
															</div>
														))}
														{person.notes && (
															<p className='notes'>{person.notes}</p>
														)}
													</div>
												)
											);
										})()}
									</div>
								</div>
								<div className='show-navigation'>
									<button
										className='nav-button prev'
										onClick={() => handleShowNavigation("prev")}
										aria-label='Previous show'
									>
										← Previous
									</button>
									<button
										className='nav-button next'
										onClick={() => handleShowNavigation("next")}
										aria-label='Next show'
									>
										Next →
									</button>
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

		const lastName = values[0];
		const firstName = values[1];
		const show = values[2];
		const isRevival = values[3];
		const opening = values[4];
		const closing = values[5];
		const performances = values[6];
		const position = values[7];
		// const ogOrReplacement = values[8];
		const positionStart = values[9];
		const positionEnd = values[10];
		// const maestraProfileUrl = values[11];
		const notes = values[12];

		// Skip if any required values are missing or empty
		// TODO handle shows still open
		if (!show || !opening || !closing) continue;

		// Parse dates with error handling
		let openingDate, closingDate;
		try {
			openingDate = new Date(opening);
			closingDate = new Date(closing);

			// Check if dates are valid
			if (isNaN(openingDate.getTime())) {
				console.error(`Invalid start date for show "${show}": ${opening}`);
				continue;
			}
			if (isNaN(closingDate.getTime())) {
				console.error(`Invalid end date for show "${show}": ${closing}`);
				continue;
			}
		} catch (error) {
			console.error(`Error parsing dates for show "${show}":`, error);
			continue;
		}

		const normalizedShow = normalizeShowTitle(show);
		if (!showMap.has(normalizedShow)) {
			const showData = {
				start: openingDate,
				end: closingDate,
				positions: new Set(),
				isRevival,
				originalTitle: show,
				people: [],
				performances: performances || null,
			};
			showMap.set(normalizedShow, showData);
		}

		const existing = showMap.get(normalizedShow);
		if (existing.positionEnd === "End of run" || positionEnd === "EOR") {
			existing.positionEnd = closingDate;
		}

		// Add person to the show's people array
		existing.people.push({
			name: `${firstName} ${lastName}`,
			position,
			notes,
			positionStart,
			positionEnd,
		});
	}

	// Sort shows by start date
	const sortedShows = Array.from(showMap.entries()).sort(
		(a, b) => a[1].start - b[1].start
	);

	// Create tracks for shows to prevent overlapping
	const tracks = [];
	sortedShows.forEach(([showId, showData]) => {
		// Find the first track where this show can fit
		let trackIndex = 0;
		let foundTrack = false;

		// Try to find an existing track where this show can fit
		while (trackIndex < tracks.length) {
			const track = tracks[trackIndex];
			// Check if this show can fit in this track (no overlap with any show in the track)
			const canFit = track.every((show) => {
				// A show overlaps if:
				// 1. The new show starts before the existing show ends AND
				// 2. The new show ends after the existing show starts
				const noOverlap =
					showData.start >= show.end || showData.end <= show.start;
				return noOverlap;
			});
			if (canFit) {
				foundTrack = true;
				break;
			}
			trackIndex++;
		}

		// If no suitable track found, create a new one
		if (!foundTrack) {
			trackIndex = tracks.length;
			tracks.push([]);
		}

		// Add show to the track
		tracks[trackIndex].push({
			id: showId,
			start: showData.start,
			end: showData.end,
			content: showData.originalTitle,
			title: `${
				showData.originalTitle
			}\n${showData.start.toLocaleDateString()} to ${showData.end.toLocaleDateString()}\n${
				showData.isRevival ? showData.isRevival : "Original Production"
			}`,
			className: `show-item ${showData.isRevival ? "revival" : "original"}`,
			isRevival: showData.isRevival,
			group: `track-${trackIndex + 1}`,
			type: "box",
			people: showData.people,
			performances: showData.performances,
		});
	});

	// Flatten tracks into items array
	tracks.forEach((track) => {
		items.push(...track);
	});

	// Create groups for each track
	const groups = tracks.map((_, index) => ({
		id: `track-${index + 1}`,
		content: `Track ${index + 1}`,
	}));

	return {
		items,
		groups,
	};
}

export default App;
