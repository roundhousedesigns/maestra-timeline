import { useEffect, useState, useRef, useMemo } from "react";
import { Timeline } from "vis-timeline/standalone";
import "vis-timeline/styles/vis-timeline-graph2d.css";
import "./App.css";

// Add these constants at the top of the file, after imports
const TIMELINE_OPTIONS = {
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
	stack: true,
	verticalScroll: true,
	horizontalScroll: true,
	margin: {
		item: {
			horizontal: 2,
			vertical: 5,
		},
	},
	showTooltips: false,
	zoomMin: 1000 * 60 * 60 * 24 * 365 * 3, // 3 years
	zoomMax: 1000 * 60 * 60 * 24 * 365 * 30, // 30 years
	zoomFriction: 10,
};

// Utility functions
const formatDate = (date) => date.toLocaleDateString();
const capitalizeWords = (str) =>
	str.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
const getDisplayTitle = (show) =>
	`${show.content} (${new Date(show.start).getFullYear()} ${
		show.isRevival ? "revival" : "original production"
	})`;

function App() {
	// Timeline data
	const [timelineData, setTimelineData] = useState({ items: [] });
	const timelineRef = useRef(null);
	const timelineInstanceRef = useRef(null);

	// Panel state
	const [isPanelOpen, setIsPanelOpen] = useState(false);
	const [selectedShow, setSelectedShow] = useState(null);
	const [selectedPerson, setSelectedPerson] = useState(null);
	const [previousShow, setPreviousShow] = useState(null);
	const sidePanelRef = useRef(null);
	const closeButtonRef = useRef(null);
	const mainContentRef = useRef(null);
	const personDetailsRef = useRef(null);
	const showDetailsRef = useRef(null);

	// Person search state
	const [searchQuery, setSearchQuery] = useState("");
	const [filteredPeople, setFilteredPeople] = useState([]);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [activePersonIndex, setActivePersonIndex] = useState(-1);
	const searchRef = useRef(null);

	// Show search state
	const [showSearchQuery, setShowSearchQuery] = useState("");
	const [filteredShows, setFilteredShows] = useState([]);
	const [showShowSuggestions, setShowShowSuggestions] = useState(false);
	const [activeShowIndex, setActiveShowIndex] = useState(-1);
	const showSearchRef = useRef(null);

	// Memoize the sorted shows for navigation
	const sortedShows = useMemo(
		() =>
			[...timelineData.items].sort(
				(a, b) => new Date(a.start) - new Date(b.start)
			),
		[timelineData.items]
	);

	// Memoize the person shows list
	const getPersonShows = useMemo(
		() => (personName) =>
			timelineData.items.filter((item) =>
				item.people.some((p) => p.name === personName)
			),
		[timelineData.items]
	);

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
		const timeline = new Timeline(
			container,
			timelineData.items,
			TIMELINE_OPTIONS
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
			if (
				sidePanelRef.current &&
				!sidePanelRef.current.contains(event.target) &&
				timelineRef.current &&
				!timelineRef.current.contains(event.target)
			) {
				setIsPanelOpen(false);
				setPreviousShow(null);
				// Return focus to the main content
				mainContentRef.current?.focus();
			}
		}

		if (isPanelOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isPanelOpen]);

	// Function to handle person click
	const handlePersonClick = (person) => {
		setPreviousShow(selectedShow);
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

	// Update handleShowNavigation to use memoized sortedShows
	const handleShowNavigation = (direction) => {
		const currentIndex = sortedShows.findIndex(
			(show) => show.id === selectedShow.id
		);

		const newIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;

		if (newIndex >= 0 && newIndex < sortedShows.length) {
			const newShow = sortedShows[newIndex];
			setSelectedShow(newShow);
			timelineInstanceRef.current.moveTo(newShow.start);
			timelineInstanceRef.current.setSelection(newShow.id);
		}
	};

	const handleBackToShow = () => {
		setSelectedShow(previousShow);
		setSelectedPerson(null);
		// Scroll to the show in the timeline
		timelineInstanceRef.current.moveTo(previousShow.start);
		// Highlight the show
		timelineInstanceRef.current.setSelection(previousShow.id);
	};

	// Function to get all unique people from timeline data
	const getAllPeople = () => {
		const peopleSet = new Set();
		const peopleMap = new Map();

		timelineData.items.forEach((item) => {
			item.people?.forEach((person) => {
				if (!peopleSet.has(person.name)) {
					peopleSet.add(person.name);
					peopleMap.set(person.name, {
						name: person.name,
						positions: [],
						notes: person.notes,
						maestraProfileUrl: person.maestraProfileUrl,
					});
				}
				if (person.position) {
					peopleMap.get(person.name).positions.push({
						position: person.position,
						start: person.positionStart
							? {
									original: person.positionStart.original,
									date: person.positionStart.date,
							  }
							: null,
						end: person.positionEnd
							? {
									original: person.positionEnd.original,
									date: person.positionEnd.date,
							  }
							: null,
					});
				}
			});
		});

		// Convert to array and sort by last name
		return Array.from(peopleMap.values()).sort((a, b) => {
			const aNameParts = a.name.split(" ");
			const bNameParts = b.name.split(" ");
			const aLastName = aNameParts[aNameParts.length - 1];
			const bLastName = bNameParts[bNameParts.length - 1];
			return aLastName.localeCompare(bLastName);
		});
	};

	// Update filtered people when search query changes
	useEffect(() => {
		if (searchQuery.trim() === "") {
			// Show all people when search is empty and suggestions are visible
			if (showSuggestions) {
				setFilteredPeople(getAllPeople());
			} else {
				setFilteredPeople([]);
			}
			return;
		}

		const allPeople = getAllPeople();
		const filtered = allPeople.filter((person) =>
			person.name.toLowerCase().includes(searchQuery.toLowerCase())
		);
		setFilteredPeople(filtered);
	}, [searchQuery, timelineData, showSuggestions]);

	// Update filtered shows when show search query changes
	useEffect(() => {
		if (showSearchQuery.trim() === "") {
			// Show all shows when search is empty and suggestions are visible
			if (showShowSuggestions) {
				// Group shows by title to check for duplicates
				const showsByTitle = new Map();
				timelineData.items.forEach((show) => {
					const title = show.content;
					if (!showsByTitle.has(title)) {
						showsByTitle.set(title, []);
					}
					showsByTitle.get(title).push(show);
				});

				setFilteredShows(
					timelineData.items
						.map((show) => ({
							...show,
							displayTitle:
								showsByTitle.get(show.content).length > 1
									? `${show.content} (${new Date(show.start).getFullYear()} ${
											show.isRevival ? "revival" : "original production"
									  })`
									: show.content,
						}))
						.sort((a, b) => a.content.localeCompare(b.content))
				);
			} else {
				setFilteredShows([]);
			}
			return;
		}

		const filtered = timelineData.items.filter((show) =>
			show.content.toLowerCase().includes(showSearchQuery.toLowerCase())
		);

		// Group shows by title to check for duplicates
		const showsByTitle = new Map();
		filtered.forEach((show) => {
			const title = show.content;
			if (!showsByTitle.has(title)) {
				showsByTitle.set(title, []);
			}
			showsByTitle.get(title).push(show);
		});

		// Add year and production type only to duplicate titles
		const processedShows = filtered.map((show) => ({
			...show,
			displayTitle:
				showsByTitle.get(show.content).length > 1
					? `${show.content} (${new Date(show.start).getFullYear()} ${
							show.isRevival ? "revival" : "original production"
					  })`
					: show.content,
		}));

		// Sort the processed shows alphabetically
		processedShows.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
		setFilteredShows(processedShows);
	}, [showSearchQuery, timelineData, showShowSuggestions]);

	// Handle click outside of search suggestions
	useEffect(() => {
		function handleClickOutside(event) {
			if (searchRef.current && !searchRef.current.contains(event.target)) {
				setShowSuggestions(false);
			}
			if (
				showSearchRef.current &&
				!showSearchRef.current.contains(event.target)
			) {
				setShowShowSuggestions(false);
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, []);

	// Handle person selection from search
	const handlePersonSelect = (person) => {
		setSelectedPerson(person);
		setIsPanelOpen(true);
		setSearchQuery("");
		setShowSuggestions(false);
		setPreviousShow(null);
	};

	// Handle show selection from search
	const handleShowSelect = (show) => {
		setSelectedShow(show);
		setSelectedPerson(null);
		setIsPanelOpen(true);
		setShowSearchQuery("");
		setShowShowSuggestions(false);
		// Scroll to the show in the timeline
		timelineInstanceRef.current.moveTo(show.start);
		// Highlight the show
		timelineInstanceRef.current.setSelection(show.id);
	};

	// Add these new functions after the existing handler functions
	const handlePersonKeyDown = (e) => {
		if (!showSuggestions) return;

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setActivePersonIndex((prev) =>
					prev < filteredPeople.length - 1 ? prev + 1 : prev
				);
				break;
			case "ArrowUp":
				e.preventDefault();
				setActivePersonIndex((prev) => (prev > 0 ? prev - 1 : prev));
				break;
			case "Enter":
				e.preventDefault();
				if (activePersonIndex >= 0) {
					handlePersonSelect(filteredPeople[activePersonIndex]);
				}
				break;
			case "Escape":
				e.preventDefault();
				setShowSuggestions(false);
				setActivePersonIndex(-1);
				break;
		}
	};

	const handleShowKeyDown = (e) => {
		if (!showShowSuggestions) return;

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setActiveShowIndex((prev) =>
					prev < filteredShows.length - 1 ? prev + 1 : prev
				);
				break;
			case "ArrowUp":
				e.preventDefault();
				setActiveShowIndex((prev) => (prev > 0 ? prev - 1 : prev));
				break;
			case "Enter":
				e.preventDefault();
				if (activeShowIndex >= 0) {
					handleShowSelect(filteredShows[activeShowIndex]);
				}
				break;
			case "Escape":
				e.preventDefault();
				setShowShowSuggestions(false);
				setActiveShowIndex(-1);
				break;
		}
	};

	// Add this new function after the existing handler functions
	const handleSidePanelKeyDown = (e) => {
		if (e.key === "Escape") {
			e.preventDefault();
			setIsPanelOpen(false);
			setSelectedPerson(null);
			// Return focus to the main content
			mainContentRef.current?.focus();
		}
	};

	// Add focus management effect
	useEffect(() => {
		if (isPanelOpen) {
			// Focus the side panel when it opens
			sidePanelRef.current?.focus();
		}
	}, [isPanelOpen]);

	// Add this new effect after the existing focus management effect
	useEffect(() => {
		if (isPanelOpen) {
			// Focus the appropriate top element based on the current view
			if (selectedPerson) {
				personDetailsRef.current?.focus();
			} else if (selectedShow) {
				showDetailsRef.current?.focus();
			}
		}
	}, [isPanelOpen, selectedPerson, selectedShow]);

	return (
		<div className='app'>
			<div className='timeline-container' ref={mainContentRef} tabIndex={-1}>
				<div className='search-filters'>
					<div className='person-search-container' ref={searchRef}>
						<label htmlFor='person-search' className='screen-reader-text'>
							Search for a person
						</label>
						<input
							type='text'
							id='person-search'
							name='person-search'
							className='search-input'
							placeholder='Search for a person...'
							value={searchQuery}
							onChange={(e) => {
								setSearchQuery(e.target.value);
								setShowSuggestions(true);
								setActivePersonIndex(-1);
							}}
							onFocus={() => {
								setShowSuggestions(true);
								setFilteredPeople(getAllPeople());
							}}
							onKeyDown={handlePersonKeyDown}
							role='combobox'
							aria-expanded={showSuggestions}
							aria-controls='person-suggestions'
							aria-activedescendant={
								activePersonIndex >= 0
									? `person-${activePersonIndex}`
									: undefined
							}
							aria-autocomplete='list'
						/>
						{showSuggestions && filteredPeople.length > 0 && (
							<div
								id='person-suggestions'
								className='search-suggestions'
								role='listbox'
							>
								{filteredPeople.map((person, index) => (
									<div
										key={index}
										id={`person-${index}`}
										className={`suggestion-item ${
											index === activePersonIndex ? "active" : ""
										}`}
										onClick={() => handlePersonSelect(person)}
										role='option'
										aria-selected={index === activePersonIndex}
										tabIndex={-1}
									>
										{person.name}
									</div>
								))}
							</div>
						)}
					</div>
					<div className='show-search-container' ref={showSearchRef}>
						<label htmlFor='show-search' className='screen-reader-text'>
							Search for a show
						</label>
						<input
							type='text'
							id='show-search'
							name='show-search'
							className='search-input'
							placeholder='Search for a show...'
							value={showSearchQuery}
							onChange={(e) => {
								setShowSearchQuery(e.target.value);
								setShowShowSuggestions(true);
								setActiveShowIndex(-1);
							}}
							onFocus={() => {
								setShowShowSuggestions(true);
								setFilteredShows(
									timelineData.items
										.map((show) => ({
											...show,
											displayTitle: getDisplayTitle(show),
										}))
										.sort((a, b) => a.content.localeCompare(b.content))
								);
							}}
							onKeyDown={handleShowKeyDown}
							role='combobox'
							aria-expanded={showShowSuggestions}
							aria-controls='show-suggestions'
							aria-activedescendant={
								activeShowIndex >= 0 ? `show-${activeShowIndex}` : undefined
							}
							aria-autocomplete='list'
						/>
						{showShowSuggestions && filteredShows.length > 0 && (
							<div
								id='show-suggestions'
								className='show-search-suggestions'
								role='listbox'
							>
								{filteredShows.map((show, index) => (
									<div
										key={index}
										id={`show-${index}`}
										className={`show-search-suggestion-item ${
											index === activeShowIndex ? "active" : ""
										}`}
										onClick={() => handleShowSelect(show)}
										role='option'
										aria-selected={index === activeShowIndex}
										tabIndex={-1}
									>
										{show.displayTitle}
									</div>
								))}
							</div>
						)}
					</div>
				</div>
				<div id='timeline' className='timeline' ref={timelineRef}></div>
				<div
					ref={sidePanelRef}
					className={`side-panel ${isPanelOpen ? "open" : ""}`}
					role='dialog'
					aria-modal='true'
					aria-label={selectedPerson ? "Person Details" : "Show Details"}
					tabIndex={-1}
					onKeyDown={handleSidePanelKeyDown}
				>
					<button
						ref={closeButtonRef}
						className='close-button'
						onClick={() => {
							setIsPanelOpen(false);
							setSelectedPerson(null);
							mainContentRef.current?.focus();
						}}
						aria-label='Close details panel'
					>
						×
					</button>
					{selectedPerson ? (
						<div
							className='person-details'
							ref={personDetailsRef}
							tabIndex={-1}
						>
							{previousShow && (
								<button
									className='back-button'
									onClick={handleBackToShow}
									aria-label={`Back to ${previousShow.content}`}
								>
									← Back to {previousShow.content}
								</button>
							)}
							<div className='person-header'>
								<h2>{selectedPerson.name}</h2>
								{selectedPerson.maestraProfileUrl && (
									<a
										href={selectedPerson.maestraProfileUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="maestra-profile-link"
										aria-label={`View ${selectedPerson.name}'s Maestra Profile`}
									>
										Maestra Profile
									</a>
								)}
							</div>
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
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault();
													handleShowClick(show.id);
												}
											}}
											role='button'
											tabIndex={0}
											aria-label={`View details for ${show.content}`}
										>
											<h4>{show.content}</h4>
											<p
												className={`type ${
													show.isRevival ? "revival" : "original"
												}`}
											>
												{!show.isRevival
													? "Original Production"
													: capitalizeWords(show.isRevival)}
											</p>
											<div className='dates'>
												<p className='date'>
													Opened: {formatDate(new Date(show.start))}
												</p>
												<p className='date'>
													{show.end ? (
														<>Closed: {formatDate(new Date(show.end))}</>
													) : (
														<>Currently running</>
													)}
												</p>
												<hr />
												{show.people?.find(
													(p) => p.name === selectedPerson.name
												)?.position && (
													<p className='date'>
														Position:{" "}
														{
															show.people.find(
																(p) => p.name === selectedPerson.name
															).position
														}
													</p>
												)}
												{show.people?.find(
													(p) => p.name === selectedPerson.name
												)?.positionStart && (
													<p className='date'>
														Position Start:{" "}
														{
															show.people.find(
																(p) => p.name === selectedPerson.name
															).positionStart.original
														}
													</p>
												)}
												{show.people?.find(
													(p) => p.name === selectedPerson.name
												)?.positionEnd && (
													<p className='date'>
														Position End:{" "}
														{
															show.people.find(
																(p) => p.name === selectedPerson.name
															).positionEnd.original
														}
													</p>
												)}
											</div>
										</div>
									))}
								</div>
							</div>
						</div>
					) : (
						selectedShow && (
							<div className='show-details' ref={showDetailsRef} tabIndex={-1}>
								<h2 className='show-title'>{selectedShow.content}</h2>
								<div className='show-info'>
									<p
										className={`type ${
											selectedShow.isRevival ? "revival" : "original"
										}`}
									>
										{!selectedShow.isRevival
											? "Original Production"
											: capitalizeWords(selectedShow.isRevival)}
									</p>
									<div className='dates'>
										<p className='date'>
											Opened: {formatDate(new Date(selectedShow.start))}
										</p>
										<p className='date'>
											{selectedShow.end ? (
												<>Closed: {formatDate(new Date(selectedShow.end))}</>
											) : (
												<>Currently running</>
											)}
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
															? {
																	original: person.positionStart.original,
																	date: person.positionStart.date,
															  }
															: null,
														end: person.positionEnd
															? {
																	original: person.positionEnd.original,
																	date: person.positionEnd.date,
															  }
															: null,
													});
												}
											});

											peopleMap.forEach((person) => {
												person.positions.sort((a, b) => {
													if (!a.start?.date && !b.start?.date) return 0;
													if (!a.start?.date) return 1;
													if (!b.start?.date) return -1;
													return b.start.date - a.start.date;
												});
											});

											return Array.from(peopleMap.values()).map(
												(person, index) => (
													<div
														key={index}
														className='person-link'
														onClick={() => handlePersonClick(person)}
														onKeyDown={(e) => {
															if (e.key === "Enter" || e.key === " ") {
																e.preventDefault();
																handlePersonClick(person);
															}
														}}
														role='button'
														tabIndex={0}
														aria-label={`View details for ${person.name}`}
													>
														<h4 className='person-name'>{person.name}</h4>
														{person.positions.map((pos, posIndex) => (
															<div key={posIndex}>
																<p className='position'>{pos.position}</p>
																{pos.start && (
																	<p className='dates'>
																		{pos.end?.date &&
																		!isNaN(pos.end.date.getTime()) ? (
																			pos.start.original ===
																			pos.end.original ? (
																				pos.start.original
																			) : (
																				<>
																					{pos.start.original} to{" "}
																					{pos.end.original}
																				</>
																			)
																		) : (
																			<>Start: {pos.start.original}</>
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

/**
 * Process the CSV data and return the timeline items
 *
 * @param {string} csvText - The CSV text to process
 * @returns {Object} The processed timeline items
 */
function processCSVData(csvText) {
	const lines = csvText.split("\n");
	const items = [];
	const showMap = new Map(); // Track unique shows and their dates
	const personProfileMap = new Map(); // Track person names to their Maestra profile URLs

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

	// Helper function to create a unique show identifier
	function createShowId(show, openingDate) {
		return `${normalizeShowTitle(show)}_${openingDate.getTime()}`;
	}

	// First pass: collect all unique shows and their dates, and build person profile map
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
		const positionStart = values[9];
		const positionEnd = values[10];
		const maestraProfileUrl = values[11];
		const notes = values[12];

		// Skip if any required values are missing or empty
		if (!show || !opening) continue;

		// Store the Maestra profile URL in the person map if it exists
		const fullName = `${firstName} ${lastName}`;
		if (maestraProfileUrl && !personProfileMap.has(fullName)) {
			personProfileMap.set(fullName, maestraProfileUrl);
		}

		// Parse dates with error handling
		let openingDate, closingDate;
		try {
			openingDate = new Date(opening);
			closingDate = closing ? new Date(closing) : false;

			// Check if dates are valid
			if (isNaN(openingDate.getTime())) {
				console.error(`Invalid start date for show "${show}": ${opening}`);
				continue;
			}
			if (closingDate !== false && isNaN(closingDate.getTime())) {
				console.error(`Invalid end date for show "${show}": ${closing}`);
				continue;
			}
		} catch (error) {
			console.error(`Error parsing dates for show "${show}":`, error);
			continue;
		}

		const showId = createShowId(show, openingDate);
		if (!showMap.has(showId)) {
			const showData = {
				start: openingDate,
				end: closingDate,
				positions: new Set(),
				isRevival,
				originalTitle: show,
				people: [],
				performances: performances || null,
			};
			showMap.set(showId, showData);
		}

		const existing = showMap.get(showId);

		// Add person to the show's people array
		existing.people.push({
			name: fullName,
			position,
			notes,
			positionStart: positionStart
				? {
						original: positionStart,
						date: new Date(positionStart),
				  }
				: null,
			positionEnd: positionEnd
				? {
						original: positionEnd === "EOR" ? "End of run" : positionEnd,
						date:
							positionEnd === "EOR" || positionEnd === "End of run"
								? closingDate
								: new Date(positionEnd),
				  }
				: null,
			maestraProfileUrl: personProfileMap.get(fullName) || null,
		});
	}

	// Convert shows to timeline items
	showMap.forEach((showData, showId) => {
		items.push({
			id: showId,
			start: showData.start,
			...(showData.end && { end: showData.end }),
			content: showData.originalTitle,
			title: `${
				showData.originalTitle
			}\n${showData.start.toLocaleDateString()} to ${
				showData.end ? showData.end.toLocaleDateString() : "Currently running"
			}\n${showData.isRevival ? showData.isRevival : "Original Production"}`,
			className: `show-item ${showData.isRevival ? "revival" : "original"}`,
			isRevival: showData.isRevival,
			type: "box",
			people: showData.people,
			performances: showData.performances,
		});
	});

	return {
		items,
	};
}

export default App;
