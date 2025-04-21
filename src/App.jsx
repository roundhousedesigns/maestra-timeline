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
	const showHeight = 40;
	const showSpacing = 10; // Vertical spacing between shows
	const yearWidth = 200; // Width of each year column
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
		// Sort items by duration (longest to shortest)
		const sortedItems = [...items].sort((a, b) => {
			const durationA = a.end - a.start;
			const durationB = b.end - b.start;
			return durationB - durationA; // Sort in descending order
		});
		
		// Initialize all items with no row assignment
		sortedItems.forEach(item => item.row = -1);
		
		// Assign rows to prevent overlaps
		let maxRow = 0;
		sortedItems.forEach((item, index) => {
			// Find the first available row that doesn't overlap with any previous items
			let row = 0;
			while (true) {
				let canUseRow = true;
				
				// Check against all previously assigned items
				for (let i = 0; i < index; i++) {
					const otherItem = sortedItems[i];
					if (otherItem.row === row) {
						// Add 1 year buffer to both end dates
						const otherItemEndWithBuffer = new Date(otherItem.end);
						otherItemEndWithBuffer.setFullYear(otherItemEndWithBuffer.getFullYear() + 1);
						
						const itemEndWithBuffer = new Date(item.end);
						itemEndWithBuffer.setFullYear(itemEndWithBuffer.getFullYear() + 1);
						
						// Check if the items overlap in time (including buffer)
						if (item.start < otherItemEndWithBuffer && otherItem.start < itemEndWithBuffer) {
							canUseRow = false;
							break;
						}
					}
				}
				
				if (canUseRow) {
					item.row = row;
					maxRow = Math.max(maxRow, row);
					break;
				}
				row++;
			}
		});

		return sortedItems;
	};

	useEffect(() => {
		const fetchData = async () => {
			if (!isLoading) return; // Prevent duplicate loads

			try {
				console.log("Fetching data from:", import.meta.env.VITE_DATA_FILE_PATH);
				const response = await fetch(import.meta.env.VITE_DATA_FILE_PATH);
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

		// Get the range of years
		const years = d3.extent(timelineData, d => d.start.getFullYear());
		const yearRange = d3.range(years[0], years[1] + 1);
		
		// Calculate dimensions
		const width = yearRange.length * yearWidth + margin.left + margin.right;
		const maxRows = Math.max(...timelineData.map(d => d.row || 0)) + 1;
		const totalHeight = (maxRows * (showHeight + showSpacing)) + margin.top + margin.bottom;

		// Clear previous content
		d3.select(timelineRef.current).selectAll("*").remove();

		// Create SVG
		const svg = d3
			.select(timelineRef.current)
			.append("svg")
			.attr("width", width)
			.attr("height", totalHeight);

		// Create main group
		const mainGroup = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

		// Create year columns
		const yearGroups = mainGroup
			.selectAll(".year-group")
			.data(yearRange)
			.enter()
			.append("g")
			.attr("class", "year-group")
			.attr("transform", (d, i) => `translate(${i * yearWidth},0)`);

		// Add year labels
		yearGroups
			.append("text")
			.attr("class", "year-label")
			.attr("x", yearWidth / 2)
			.attr("y", -10)
			.attr("text-anchor", "middle")
			.text(d => d);

		// Add year background
		yearGroups
			.append("rect")
			.attr("class", "year-background")
			.attr("width", yearWidth)
			.attr("height", totalHeight - margin.top - margin.bottom)
			.attr("fill", (d, i) => i % 2 === 0 ? "#f8f9fa" : "#ffffff")
			.attr("opacity", 0.5);

		// Create shows
		const shows = mainGroup
			.selectAll(".show")
			.data(timelineData)
			.enter()
			.append("g")
			.attr("class", "show");

		// Calculate show positions and widths
		shows.each(function(d) {
			const openYear = d.start.getFullYear();
			const closeYear = d.end.getFullYear();
			const yearSpan = closeYear - openYear + 1;
			
			const cellPadding = 4; // Add padding to each year cell
			const x = (openYear - years[0]) * yearWidth + cellPadding;
			const width = yearSpan * yearWidth - (cellPadding * 2);
			const y = d.row * (showHeight + showSpacing);
			
			d3.select(this)
				.attr("transform", `translate(${x},${y})`);
			
			// Add show rectangle
			d3.select(this)
				.append("rect")
				.attr("class", "show-header")
				.attr("width", width)
				.attr("height", showHeight)
				.attr("fill", "#4a90e2")
				.attr("opacity", 0.8)
				.attr("rx", 4)
				.style("cursor", "pointer");
			
			// Add show title
			d3.select(this)
				.append("text")
				.attr("class", "show-title")
				.attr("x", 8)
				.attr("y", showHeight / 2)
				.attr("dy", ".35em")
				.text(d => {
					const duration = Math.round((d.end - d.start) / (1000 * 60 * 60 * 24 * 30));
					return `${d.title} (${duration} months)`;
				})
				.style("fill", "white")
				.style("font-size", "13px")
				.style("font-weight", "bold");
		});

		// Add click behavior to shows
		shows.on("click", function(event, d) {
			event.stopPropagation();
			setModalContent({
				name: d.title,
				shows: d.people.map(person => ({
					show: d.title,
					position: person.position,
					dates: `${person.startDate ? person.startDate.toLocaleDateString() : "unknown"} - ${
						person.endDate ? person.endDate.toLocaleDateString() : "present"
					}`,
					name: person.name,
				})),
			});
		});

		// Add zoom controls
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

		// Set up zoom behavior
		const zoom = d3.zoom()
			.scaleExtent([minZoom, maxZoom])
			.on("zoom", (event) => {
				mainGroup.attr("transform", `translate(${event.transform.x + margin.left},${event.transform.y + margin.top}) scale(${event.transform.k})`);
			});

		svg.call(zoom);
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
						backgroundColor: "rgba(0, 0, 0, 0.75)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 1000,
					}}
					onClick={() => setModalContent(null)}
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
						onClick={(e) => e.stopPropagation()}
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
										padding: "15px",
										border: "1px solid #e6e6e6",
										borderRadius: "6px",
										backgroundColor: "#ffffff",
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
								>
									<div
										style={{
											fontWeight: "600",
											color: "#1a1a1a",
											fontSize: "16px",
											marginBottom: "8px",
										}}
									>
										{show.name}
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
							}}
						>
							Close
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
