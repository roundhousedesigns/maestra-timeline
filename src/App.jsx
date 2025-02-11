import { useState, useEffect, useRef } from "react";
import * as d3 from "d3";
import Papa from "papaparse";

export default function ConductorTimeline() {
	const [timelineData, setTimelineData] = useState([]);
	const [modalContent, setModalContent] = useState(null);
	const timelineRef = useRef(null);

	// Move these constants outside of the useEffect
	const margin = { top: 50, right: 100, bottom: 150, left: 100 };
	const showWidth = 200; // Fixed width for all shows
	const numTracks = 4;
	const trackHeight = 60;
	const showHeight = 50;
	const trackPadding = 10;
	const nameHeight = 16; // Height per name
	const namePadding = 10; // Padding between names and show rectangle
	const minZoom = 0.1;
	const maxZoom = 10;
	const hoverDelay = 300; // milliseconds

	const parseDate = (dateStr) => {
		if (!dateStr) return null;
		dateStr = dateStr.replace(/\(.*?\)/g, "").trim();
		
		if (["present", "Present", "end of run", "unknown", "Unknown", "??"].includes(dateStr)) {
			return dateStr.toLowerCase() === "present" ? new Date() : null;
		}

		if (dateStr.toLowerCase().includes("circa")) {
			dateStr = dateStr.replace(/circa/i, "").trim();
		}

		const monthNames = {
			jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
			jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
		};

		for (const [monthName, monthNum] of Object.entries(monthNames)) {
			if (dateStr.toLowerCase().includes(monthName)) {
				const year = dateStr.match(/\d{4}/)?.[0];
				if (year) return new Date(parseInt(year, 10), monthNum, 1);
			}
		}

		if (dateStr.includes("/")) {
			const [month, day, year] = dateStr.split("/");
			if (month && day && year) {
				return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
			}
		}

		return null;
	};

	const assignTracks = (items, numTracks = 4) => {
		// Sort items chronologically first
		const sortedItems = [...items].sort((a, b) => a.start - b.start);
		
		// Simply assign tracks in a round-robin fashion
		sortedItems.forEach((item, index) => {
			item.track = index % numTracks;
		});
		
		return sortedItems;
	};

	useEffect(() => {
		const fetchData = async () => {
			const response = await fetch(import.meta.env.VITE_DATA_FILE_PATH);
			const csvText = await response.text();
			const parsed = Papa.parse(csvText, { header: true }).data;

			// Group shows with their conductors
			const showGroups = parsed.reduce((acc, row) => {
				const showName = row["SHOW"];
				if (!acc[showName]) {
					acc[showName] = {
						opening: parseDate(row["OPENING DATE"]),
						closing: parseDate(row["CLOSING DATE"]),
						people: []
					};
				}
				acc[showName].people.push({
					name: `${row["FIRST NAME"]} ${row["LAST NAME"]}`,
					position: row["POSITION"],
					startDate: parseDate(row["START DATE"]),
					endDate: parseDate(row["END DATE"])
				});
				return acc;
			}, {});

			// Convert to array and sort by opening date
			const timelineItems = Object.entries(showGroups)
				.map(([showName, show]) => ({
					title: showName,
					start: show.opening,
					end: show.closing || new Date(),
					people: show.people
				}))
				.filter(item => item.start)
				.sort((a, b) => a.start - b.start);

			// Instead of assigning sequential levels, use track assignment
			const trackedItems = assignTracks(timelineItems);
			setTimelineData(trackedItems);

			// Create D3 visualization
			const width = Math.max(window.innerWidth * 2, timelineItems.length * 50);

			// Clear previous content
			d3.select(timelineRef.current).selectAll("*").remove();

			// Create SVG with a group for zooming
			const svg = d3.select(timelineRef.current)
				.append("svg")
				.attr("width", width + margin.left + margin.right)
				.attr("height", (numTracks * (trackHeight + trackPadding)) + margin.top + margin.bottom);

			// Update the zoom behavior to handle scaling of shows
			const zoom = d3.zoom()
				.scaleExtent([minZoom, maxZoom])
				.on("zoom", (event) => {
					// Update main group position
					mainGroup.attr("transform", event.transform);
					
					// Update the axis with zoomed scale
					const newScale = event.transform.rescaleX(xScale);
					xAxisGroup.call(xAxis.scale(newScale));

					// Scale the shows based on zoom level
					shows.each(function() {
						const show = d3.select(this);
						const currentScale = event.transform.k;
						
						// Scale the show rectangle width
						show.select(".show-header")
							.attr("width", showWidth * currentScale);

						// Scale the background rectangle for people list
						show.select(".people-background")
							.attr("width", showWidth * currentScale);

						// Update text positions and size
						show.select(".show-title")
							.attr("x", 8 * currentScale)
							.style("font-size", `${13 * Math.sqrt(currentScale)}px`);

						// Update people group
						const peopleGroup = show.select(".people");
						peopleGroup
							.attr("transform", `translate(${8 * currentScale},${trackHeight})`);

						// Update each person's text
						peopleGroup.selectAll(".person-text")
							.attr("x", (d, i) => i * 150 * currentScale)
							.style("font-size", `${11 * Math.sqrt(currentScale)}px`);
					});
				});

			svg.call(zoom);

			// Create main group for zooming
			const mainGroup = svg.append("g")
				.attr("transform", `translate(${margin.left},${margin.top})`);

			// Create scales
			const xScale = d3.scaleTime()
				.domain(d3.extent(timelineItems.flatMap(d => [d.start, d.end])))
				.range([0, width]);

			// Create timeline axis
			const xAxis = d3.axisBottom(xScale)
				.tickFormat(d3.timeFormat("%Y"));

			// Add axis with its own group
			const xAxisGroup = mainGroup.append("g")
				.attr("class", "x-axis")
				.attr("transform", `translate(0,${trackHeight + trackPadding})`)
				.call(xAxis);

			xAxisGroup.selectAll("text")
				.style("text-anchor", "end")
				.attr("dx", "-.8em")
				.attr("dy", ".15em")
				.attr("transform", "rotate(-45)");

			// Add track backgrounds
			mainGroup.selectAll(".track-bg")
				.data(d3.range(numTracks))
				.enter()
				.append("rect")
				.attr("class", "track-bg")
				.attr("x", -margin.left)
				.attr("y", d => d * (trackHeight + trackPadding))
				.attr("width", width + margin.left + margin.right)
				.attr("height", trackHeight)
				.attr("fill", (d, i) => i % 2 === 0 ? "#f8f9fa" : "#ffffff")
				.attr("opacity", 0.5);

			// Update show positioning
			const shows = mainGroup.selectAll(".show")
				.data(trackedItems)
				.enter()
				.append("g")
				.attr("class", "show")
				.attr("transform", d => {
					const x = xScale(d.start);
					const y = d.track * (trackHeight + trackPadding);
					return `translate(${isNaN(x) ? 0 : x},${isNaN(y) ? 0 : y})`;
				});

			// Update show rectangles to fixed width
			shows.append("rect")
				.attr("class", "show-header")
				.attr("width", showWidth)
				.attr("height", showHeight)
				.attr("fill", "#4a90e2")
				.attr("opacity", 0.8)
				.attr("rx", 4)
				.attr("y", (trackHeight - showHeight) / 2);

			// Update show titles
			shows.append("text")
				.attr("class", "show-title")
				.attr("x", 8)
				.attr("y", trackHeight / 2)
				.attr("dy", ".35em")
				.text(d => d.title)
				.style("fill", "white")
				.style("font-size", "13px")
				.style("font-weight", "bold");

			// Create expandable people list
			shows.each(function(d) {
				const show = d3.select(this);
				const people = d.people;

				const peopleGroup = show.append("g")
					.attr("class", "people")
					.attr("transform", `translate(8,${trackHeight})`)
					.style("opacity", 0)
					.style("pointer-events", "none");

				// Update the people list background to match fixed width
				peopleGroup.append("rect")
					.attr("class", "people-background")
					.attr("x", -8)
					.attr("y", 0)
					.attr("width", showWidth)
					.attr("height", people.length * nameHeight + namePadding * 2)
					.attr("fill", "#ffffff")
					.attr("opacity", 0.95);

				// Add people
				people.forEach((person, i) => {
					const personGroup = peopleGroup.append("g")
						.attr("transform", `translate(0,${i * nameHeight + namePadding})`);

					// Add clickable name
					personGroup.append("text")
						.attr("class", "person-text")
						.attr("x", 0)
						.text(person.name)
						.style("fill", "#333")
						.style("font-size", "11px")
						.style("cursor", "pointer")
						.on("click", (event) => {
							event.stopPropagation();
							const personShows = timelineItems.filter(show => 
								show.people.some(p => p.name === person.name)
							).map(show => ({
								show: show.title,
								position: show.people.find(p => p.name === person.name).position,
								dates: `${show.start.toLocaleDateString()} - ${show.end.toLocaleDateString()}`
							}));

							setModalContent({
								name: person.name,
								shows: personShows
							});
						})
						.on("mouseenter", function() {
							d3.select(this)
								.style("fill", "#0066cc")
								.style("text-decoration", "underline");
						})
						.on("mouseleave", function() {
							d3.select(this)
								.style("fill", "#333")
								.style("text-decoration", "none");
						});

					// Add position and dates
					personGroup.append("text")
						.attr("x", 150)
						.text(person.position)
						.style("fill", "#666")
						.style("font-size", "11px");

					const dateText = `${
						person.startDate ? person.startDate.toLocaleDateString() : 'unknown'
					} - ${
						person.endDate ? person.endDate.toLocaleDateString() : 'present'
					}`;

					personGroup.append("text")
						.attr("x", 300)
						.text(dateText)
						.style("fill", "#666")
						.style("font-size", "11px");
				});

				let hideTimeout;
				let isHovering = false;

				// Update hover behavior
				show.on("mouseenter", function() {
					isHovering = true;
					clearTimeout(hideTimeout);
					peopleGroup
						.style("opacity", 1)
						.style("pointer-events", "all");
					
					// Bring this show to front
					this.parentNode.appendChild(this);
				})
				.on("mouseleave", function() {
					isHovering = false;
					hideTimeout = setTimeout(() => {
						// Only hide if we're not hovering over the people list
						if (!isHovering) {
							peopleGroup
								.style("opacity", 0)
								.style("pointer-events", "none");
						}
					}, hoverDelay);
				});

				// Add hover behavior to the people group itself
				peopleGroup
					.on("mouseenter", function() {
						isHovering = true;
						clearTimeout(hideTimeout);
					})
					.on("mouseleave", function() {
						isHovering = false;
						hideTimeout = setTimeout(() => {
							if (!isHovering) {
								peopleGroup
									.style("opacity", 0)
									.style("pointer-events", "none");
							}
						}, hoverDelay);
					});
			});

			// Add zoom controls (optional)
			const zoomControls = svg.append("g")
				.attr("class", "zoom-controls")
				.attr("transform", `translate(20, ${margin.top})`);

			zoomControls.append("rect")
				.attr("width", 30)
				.attr("height", 60)
				.attr("fill", "white")
				.attr("stroke", "#ccc");

			zoomControls.append("text")
				.attr("x", 15)
				.attr("y", 20)
				.attr("text-anchor", "middle")
				.style("cursor", "pointer")
				.text("+")
				.on("click", () => {
					svg.transition()
						.duration(300)
						.call(zoom.scaleBy, 1.5);
				});

			zoomControls.append("text")
				.attr("x", 15)
				.attr("y", 45)
				.attr("text-anchor", "middle")
				.style("cursor", "pointer")
				.text("-")
				.on("click", () => {
					svg.transition()
						.duration(300)
						.call(zoom.scaleBy, 0.75);
				});

			// Initial zoom to fit
			const initialScale = 0.8;
			svg.call(zoom.transform, d3.zoomIdentity
				.translate(margin.left, 0)
				.scale(initialScale));
		};

		fetchData();
	}, []);

	return (
		<div style={{ padding: "20px" }}>
			<div 
				ref={timelineRef}
				style={{
					width: "100%",
					overflowX: "hidden",
					overflowY: "hidden",
					maxHeight: "calc(100vh - 40px)",
					position: "relative",
					WebkitOverflowScrolling: "touch",
					cursor: "grab",
					backgroundColor: "#ffffff"
				}}
			>
				<div style={{
					position: "sticky",
					top: 0,
					left: 0,
					padding: "10px",
					background: "white",
					borderBottom: "1px solid #eee",
					zIndex: 1
				}}>
					Timeline of Broadway Conductors
					<span style={{ 
						marginLeft: "10px", 
						fontSize: "0.8em", 
						color: "#666" 
					}}>
						(Zoom with mouse wheel or pinch gesture)
					</span>
				</div>
			</div>

			{modalContent && (
				<div
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: "rgba(0, 0, 0, 0.75)", // Darker overlay
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 1000,
					}}
				>
					<div
						style={{
							backgroundColor: "#ffffff",
							padding: "30px",
							borderRadius: "8px",
							maxWidth: "600px",
							maxHeight: "80vh",
							overflow: "auto",
							boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
						}}
					>
						<h2 style={{ 
							color: "#1a1a1a",
							marginTop: 0,
							marginBottom: "20px",
							fontSize: "24px",
							borderBottom: "2px solid #e6e6e6",
							paddingBottom: "10px"
						}}>
							{modalContent.name}
						</h2>
						<div>
							{modalContent.shows.map((show, index) => (
								<div
									key={index}
									style={{
										marginBottom: "12px",
										cursor: "pointer",
										padding: "15px",
										border: "1px solid #e6e6e6",
										borderRadius: "6px",
										backgroundColor: "#ffffff",
										transition: "all 0.2s ease",
										boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
									}}
									onClick={() => {
										const element = d3.select(timelineRef.current)
											.selectAll(".show")
											.filter(d => d.title === show.show)
											.node();
										
										if (element) {
											element.scrollIntoView({ behavior: "smooth" });
											setModalContent(null);
										}
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.backgroundColor = "#f0f7ff";
										e.currentTarget.style.borderColor = "#2d7ff9";
										e.currentTarget.style.boxShadow = "0 2px 8px rgba(45, 127, 249, 0.1)";
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor = "#ffffff";
										e.currentTarget.style.borderColor = "#e6e6e6";
										e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.05)";
									}}
								>
									<div style={{ 
										fontWeight: "600",
										color: "#1a1a1a",
										fontSize: "16px",
										marginBottom: "8px"
									}}>
										{show.show}
									</div>
									<div style={{ 
										color: "#4a4a4a",
										fontSize: "14px",
										marginBottom: "4px"
									}}>
										{show.position}
									</div>
									<div style={{ 
										color: "#666666",
										fontSize: "14px"
									}}>
										{show.dates}
									</div>
								</div>
							))}
						</div>
						<button
							onClick={() => setModalContent(null)}
							style={{
								marginTop: "20px",
								padding: "10px 20px",
								border: "none",
								borderRadius: "6px",
								backgroundColor: "#2d7ff9",
								color: "white",
								cursor: "pointer",
								fontSize: "14px",
								fontWeight: "500",
								transition: "background-color 0.2s ease",
							}}
							onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#1c6ce3"}
							onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#2d7ff9"}
						>
							Close
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
