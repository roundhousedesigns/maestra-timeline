import { useState, useEffect, useRef } from "react";
import * as d3 from "d3";
import Papa from "papaparse";

export default function ConductorTimeline() {
	const [timelineData, setTimelineData] = useState([]);
	const [modalContent, setModalContent] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const timelineRef = useRef(null);

	// Move these constants outside of the useEffect
	const margin = { top: 50, right: 100, bottom: 150, left: 100 };
	const showWidth = 200; // Fixed width for all shows
	const trackHeight = 50; // Slightly reduced height to accommodate more lanes
	const showHeight = 40; // Adjusted to match new track height
	const trackPadding = 8; // Reduced padding to fit more lanes
	const nameHeight = 14; // Slightly reduced to fit more content
	const namePadding = 8; // Reduced padding to fit more content
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
			jan: 0,
			feb: 1,
			mar: 2,
			apr: 3,
			may: 4,
			jun: 5,
			jul: 6,
			aug: 7,
			sep: 8,
			oct: 9,
			nov: 10,
			dec: 11,
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

	const assignTracks = (items) => {
		// Sort items chronologically first
		const sortedItems = [...items].sort((a, b) => a.start - b.start);

		// Find the maximum number of concurrent shows
		const events = [];
		sortedItems.forEach((item) => {
			events.push({ time: item.start, type: 'start', item });
			events.push({ time: item.end, type: 'end', item });
		});
		events.sort((a, b) => a.time - b.time);

		let activeShows = 0;
		let maxConcurrentShows = 0;
		events.forEach((event) => {
			if (event.type === 'start') {
				activeShows++;
				maxConcurrentShows = Math.max(maxConcurrentShows, activeShows);
			} else {
				activeShows--;
			}
		});

		// Use the maximum number of concurrent shows as the number of lanes
		const requiredLanes = maxConcurrentShows;

		// Assign lanes to ensure no overlaps
		const lanes = new Array(requiredLanes).fill(null);
		sortedItems.forEach((item) => {
			// Find the first available lane
			let assignedLane = -1;
			for (let lane = 0; lane < requiredLanes; lane++) {
				const currentItem = lanes[lane];
				if (!currentItem || currentItem.end <= item.start) {
					assignedLane = lane;
					break;
				}
			}

			if (assignedLane === -1) {
				// This should never happen due to our lane calculation
				console.error("Failed to assign lane for item:", item);
				assignedLane = 0;
			}

			item.track = assignedLane;
			lanes[assignedLane] = item;
		});

		return sortedItems;
	};

	useEffect(() => {
		const fetchData = async () => {
			if (!isLoading) return; // Prevent duplicate loads

			try {
				console.log("Fetching data from:", import.meta.env.VITE_DATA_SOURCE_URL);
				const response = await fetch(import.meta.env.VITE_DATA_SOURCE_URL);
				const csvText = await response.text();
				console.log("Raw CSV text:", csvText);

				const parsed = Papa.parse(csvText, {
					header: true,
					skipEmptyLines: true,
					transformHeader: (header) => {
						// Clean up Google Sheets header formatting
						return header.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
					},
					transform: (value) => value.trim(),
				});

				console.log("Parse results:", {
					errors: parsed.errors,
					meta: parsed.meta,
					dataLength: parsed.data.length,
					firstRow: parsed.data[0],
					headers: parsed.meta.fields,
				});

				// Group shows with their conductors
				const showGroups = parsed.data.reduce((acc, row) => {
					const showName = row["SHOW"];
					if (!showName) {
						console.warn("Row missing SHOW:", row);
						return acc;
					}
					if (!acc[showName]) {
						acc[showName] = {
							opening: parseDate(row["OPENING DATE"]),
							closing: parseDate(row["CLOSING DATE"]),
							people: [],
						};
					}
					acc[showName].people.push({
						name: `${row["FIRST NAME"]} ${row["LAST NAME"]}`,
						position: row["POSITION"],
						startDate: parseDate(row["START DATE"]),
						endDate: parseDate(row["END DATE"]),
					});
					return acc;
				}, {});

				console.log("Show groups:", Object.keys(showGroups).length, "shows found");

				// Convert to array and sort by opening date
				const timelineItems = Object.entries(showGroups)
					.map(([showName, show]) => {
						console.log("Processing show:", showName, {
							opening: show.opening,
							closing: show.closing,
							rawOpening: show.rawOpening,
							rawClosing: show.rawClosing,
						});
						return {
							title: showName,
							start: show.opening,
							end: show.closing || new Date(),
							people: show.people,
						};
					})
					.filter((item) => {
						const hasStart = !!item.start;
						if (!hasStart) {
							console.log("Filtered out show (no start date):", item.title);
						}
						return hasStart;
					})
					.sort((a, b) => a.start - b.start);

				console.log("Timeline items after filtering:", timelineItems.length);

				// Instead of assigning sequential levels, use track assignment
				const trackedItems = assignTracks(timelineItems);
				setTimelineData(trackedItems);
				setIsLoading(false);
			} catch (error) {
				console.error("Error fetching data:", error);
				setIsLoading(false);
			}
		};

		fetchData();
	}, [isLoading]);

	// Add a new useEffect to handle the D3 visualization when timelineData changes
	useEffect(() => {
		if (!timelineData.length) return;

		// Create D3 visualization
		const width = Math.max(window.innerWidth * 2, timelineData.length * 50);

		// Calculate the number of lanes needed
		const numLanes = Math.max(...timelineData.map(item => item.track)) + 1;
		const totalHeight = numLanes * (trackHeight + trackPadding) + margin.top + margin.bottom;

		// Clear previous content
		d3.select(timelineRef.current).selectAll("*").remove();

		// Create SVG with a group for zooming
		const svg = d3
			.select(timelineRef.current)
			.append("svg")
			.attr("width", width + margin.left + margin.right)
			.attr("height", totalHeight);

		// Update the zoom behavior to handle scaling of shows
		const zoom = d3
			.zoom()
			.scaleExtent([minZoom, maxZoom])
			.on("zoom", (event) => {
				// Update main group position
				mainGroup.attr("transform", event.transform);

				// Update the axis with zoomed scale
				const newScale = event.transform.rescaleX(xScale);
				xAxisGroup.call(xAxis.scale(newScale));

				// Scale the shows based on zoom level
				shows.each(function (d) {
					const show = d3.select(this);
					const currentScale = event.transform.k;

					// Update show width based on duration
					const start = newScale(d.start);
					const end = newScale(d.end);
					show.select(".show-header").attr("width", Math.max(showWidth * currentScale, end - start));

					// Update text positions and size
					show
						.select(".show-title")
						.attr("x", 8 * currentScale)
						.style("font-size", `${13 * Math.sqrt(currentScale)}px`);

					// Update people group
					const peopleGroup = show.select(".people");
					peopleGroup.attr("transform", `translate(${8 * currentScale},${trackHeight})`);

					// Update each person's text
					peopleGroup
						.selectAll(".person-text")
						.attr("x", (d, i) => i * 150 * currentScale)
						.style("font-size", `${11 * Math.sqrt(currentScale)}px`);
				});
			});

		svg.call(zoom);

		// Create main group for zooming
		const mainGroup = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

		// Create scales
		const xScale = d3
			.scaleTime()
			.domain(d3.extent(timelineData.flatMap((d) => [d.start, d.end])))
			.range([0, width]);

		// Create timeline axis
		const xAxis = d3.axisBottom(xScale).tickFormat(d3.timeFormat("%Y"));

		// Add axis with its own group
		const xAxisGroup = mainGroup
			.append("g")
			.attr("class", "x-axis")
			.attr("transform", `translate(0,${trackHeight + trackPadding})`)
			.call(xAxis);

		xAxisGroup
			.selectAll("text")
			.style("text-anchor", "end")
			.attr("dx", "-.8em")
			.attr("dy", ".15em")
			.attr("transform", "rotate(-45)");

		// Add swimlane backgrounds
		mainGroup
			.selectAll(".swimlane-bg")
			.data(d3.range(numLanes))
			.enter()
			.append("rect")
			.attr("class", "swimlane-bg")
			.attr("x", -margin.left)
			.attr("y", (d) => d * (trackHeight + trackPadding))
			.attr("width", width + margin.left + margin.right)
			.attr("height", trackHeight)
			.attr("fill", (d, i) => (i % 2 === 0 ? "#f8f9fa" : "#ffffff"))
			.attr("opacity", 0.5)
			.style("pointer-events", "none");

		// Add swimlane labels
		mainGroup
			.append("g")
			.attr("class", "swimlane-labels")
			.selectAll(".swimlane-label")
			.data(d3.range(numLanes))
			.enter()
			.append("text")
			.attr("class", "swimlane-label")
			.attr("x", -margin.left + 10)
			.attr("y", (d) => (d + 0.5) * (trackHeight + trackPadding))
			.attr("dy", "0.35em")
			.text((d) => `Lane ${d + 1}`)
			.style("font-size", "12px")
			.style("fill", "#666");

		// Update show positioning
		const shows = mainGroup
			.selectAll(".show")
			.data(timelineData)
			.enter()
			.append("g")
			.attr("class", "show")
			.attr("transform", (d) => {
				const x = xScale(d.start);
				const y = d.track * (trackHeight + trackPadding);
				return `translate(${isNaN(x) ? 0 : x},${isNaN(y) ? 0 : y})`;
			});

		// Update show rectangles to show duration
		shows
			.append("rect")
			.attr("class", "show-header")
			.attr("width", (d) => {
				const start = xScale(d.start);
				const end = xScale(d.end);
				return Math.max(showWidth, end - start);
			})
			.attr("height", showHeight)
			.attr("fill", "#4a90e2")
			.attr("opacity", 0.8)
			.attr("rx", 4)
			.attr("y", (trackHeight - showHeight) / 2);

		// Update show titles with duration indicator
		shows
			.append("text")
			.attr("class", "show-title")
			.attr("x", 8)
			.attr("y", trackHeight / 2)
			.attr("dy", ".35em")
			.text((d) => {
				const duration = Math.round((d.end - d.start) / (1000 * 60 * 60 * 24 * 30)); // Duration in months
				return `${d.title} (${duration} months)`;
			})
			.style("fill", "white")
			.style("font-size", "13px")
			.style("font-weight", "bold");

		// Create expandable people list
		shows.each(function (d) {
			const show = d3.select(this);
			const people = d.people;

			const peopleGroup = show
				.append("g")
				.attr("class", "people")
				.attr("transform", `translate(8,${trackHeight})`)
				.style("opacity", 0)
				.style("pointer-events", "none");

			// Update the people list background to match fixed width
			peopleGroup
				.append("rect")
				.attr("class", "people-background")
				.attr("x", -8)
				.attr("y", 0)
				.attr("width", showWidth)
				.attr("height", people.length * nameHeight + namePadding * 2)
				.attr("fill", "#ffffff")
				.attr("opacity", 0.95);

			// Add people
			people.forEach((person, i) => {
				const personGroup = peopleGroup.append("g").attr("transform", `translate(0,${i * nameHeight + namePadding})`);

				// Add clickable name
				personGroup
					.append("text")
					.attr("class", "person-text")
					.attr("x", 0)
					.text(person.name)
					.style("fill", "#333")
					.style("font-size", "11px")
					.style("cursor", "pointer")
					.on("click", (event) => {
						event.stopPropagation();
						const personShows = timelineData
							.filter((show) => show.people.some((p) => p.name === person.name))
							.map((show) => ({
								show: show.title,
								position: show.people.find((p) => p.name === person.name).position,
								dates: `${show.start.toLocaleDateString()} - ${show.end.toLocaleDateString()}`,
							}));

						setModalContent({
							name: person.name,
							shows: personShows,
						});
					})
					.on("mouseenter", function () {
						d3.select(this).style("fill", "#0066cc").style("text-decoration", "underline");
					})
					.on("mouseleave", function () {
						d3.select(this).style("fill", "#333").style("text-decoration", "none");
					});

				// Add position and dates
				personGroup
					.append("text")
					.attr("x", 150)
					.text(person.position)
					.style("fill", "#666")
					.style("font-size", "11px");

				const dateText = `${person.startDate ? person.startDate.toLocaleDateString() : "unknown"} - ${
					person.endDate ? person.endDate.toLocaleDateString() : "present"
				}`;

				personGroup.append("text").attr("x", 300).text(dateText).style("fill", "#666").style("font-size", "11px");
			});

			let hideTimeout;
			let isHovering = false;

			// Update hover behavior
			show
				.on("mouseenter", function () {
					isHovering = true;
					clearTimeout(hideTimeout);
					peopleGroup.style("opacity", 1).style("pointer-events", "all");

					// Bring this show to front
					this.parentNode.appendChild(this);
				})
				.on("mouseleave", function () {
					isHovering = false;
					hideTimeout = setTimeout(() => {
						// Only hide if we're not hovering over the people list
						if (!isHovering) {
							peopleGroup.style("opacity", 0).style("pointer-events", "none");
						}
					}, hoverDelay);
				});

			// Add hover behavior to the people group itself
			peopleGroup
				.on("mouseenter", function () {
					isHovering = true;
					clearTimeout(hideTimeout);
				})
				.on("mouseleave", function () {
					isHovering = false;
					hideTimeout = setTimeout(() => {
						if (!isHovering) {
							peopleGroup.style("opacity", 0).style("pointer-events", "none");
						}
					}, hoverDelay);
				});
		});

		// Add zoom controls (optional)
		const zoomControls = svg
			.append("g")
			.attr("class", "zoom-controls")
			.attr("transform", `translate(20, ${margin.top})`);

		zoomControls.append("rect").attr("width", 30).attr("height", 60).attr("fill", "white").attr("stroke", "#ccc");

		zoomControls
			.append("text")
			.attr("x", 15)
			.attr("y", 20)
			.attr("text-anchor", "middle")
			.style("cursor", "pointer")
			.text("+")
			.on("click", () => {
				svg.transition().duration(300).call(zoom.scaleBy, 1.5);
			});

		zoomControls
			.append("text")
			.attr("x", 15)
			.attr("y", 45)
			.attr("text-anchor", "middle")
			.style("cursor", "pointer")
			.text("-")
			.on("click", () => {
				svg.transition().duration(300).call(zoom.scaleBy, 0.75);
			});

		// Initial zoom to fit
		const initialScale = 0.8;
		svg.call(zoom.transform, d3.zoomIdentity.translate(margin.left, 0).scale(initialScale));
	}, [margin.bottom, margin.left, margin.right, margin.top, timelineData]);

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
					backgroundColor: "#ffffff",
				}}
			>
				<div
					style={{
						position: "sticky",
						top: 0,
						left: 0,
						padding: "10px",
						background: "white",
						borderBottom: "1px solid #eee",
						zIndex: 1,
					}}
				>
					Timeline of Broadway Conductors
					<span
						style={{
							marginLeft: "10px",
							fontSize: "0.8em",
							color: "#666",
						}}
					>
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
						<h2
							style={{
								color: "#1a1a1a",
								marginTop: 0,
								marginBottom: "20px",
								fontSize: "24px",
								borderBottom: "2px solid #e6e6e6",
								paddingBottom: "10px",
							}}
						>
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
										const element = d3
											.select(timelineRef.current)
											.selectAll(".show")
											.filter((d) => d.title === show.show)
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
									<div
										style={{
											fontWeight: "600",
											color: "#1a1a1a",
											fontSize: "16px",
											marginBottom: "8px",
										}}
									>
										{show.show}
									</div>
									<div
										style={{
											color: "#4a4a4a",
											fontSize: "14px",
											marginBottom: "4px",
										}}
									>
										{show.position}
									</div>
									<div
										style={{
											color: "#666666",
											fontSize: "14px",
										}}
									>
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
							onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1c6ce3")}
							onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#2d7ff9")}
						>
							Close
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
