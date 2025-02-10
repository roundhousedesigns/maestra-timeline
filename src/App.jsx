import { useState, useEffect, useRef } from "react";

import { Timeline } from "vis-timeline/standalone";
import "vis-timeline/styles/vis-timeline-graph2d.css";
import { Network } from "vis-network/standalone";
import Papa from "papaparse";

export default function ComposerTimeline() {
	const [timelineData, setTimelineData] = useState([]);
	const [networkData, setNetworkData] = useState({ nodes: [], edges: [] });
	const [modalContent, setModalContent] = useState(null);
	const [timelineInstance, setTimelineInstance] = useState(null);

	const timelineRef = useRef(null);
	const networkRef = useRef(null);

	const escapeHtml = (str) => {
		return str
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	};

	useEffect(() => {
		const fetchData = async () => {
			const response = await fetch("data/composers.csv");
			const csvText = await response.text();
			const parsed = Papa.parse(csvText, { header: true }).data;

			const parseDate = (dateStr) => {
				if (!dateStr) return null;

				// Remove any parentheses and their contents
				dateStr = dateStr.replace(/\(.*?\)/g, "").trim();

				// Handle special cases
				if (["present", "Present", "end of run", "unknown", "Unknown", "??"].includes(dateStr)) {
					return dateStr.toLowerCase() === "present" ? new Date() : null;
				}

				// Handle "circa" dates
				if (dateStr.toLowerCase().includes("circa")) {
					dateStr = dateStr.replace(/circa/i, "").trim();
				}

				// Handle month names
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

				// Handle MM/DD/YYYY format
				if (dateStr.includes("/")) {
					const [month, day, year] = dateStr.split("/");
					if (month && day && year) {
						return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
					}
				}

				return null;
			};

			// Group the data by shows
			const showGroups = parsed.reduce((acc, row) => {
				const showName = row["SHOW"];
				if (!acc[showName]) {
					acc[showName] = {
						opening: row["OPENING DATE"],
						closing: row["CLOSING DATE"],
						people: [],
					};
				}
				acc[showName].people.push({
					name: `${row["FIRST NAME"]} ${row["LAST NAME"]}`,
					position: row["POSITION"],
					start: row["START DATE"],
					end: row["END DATE"],
				});
				return acc;
			}, {});

			const timelineItems = Object.entries(showGroups)
				.map(([showName, show], index) => {
					const startDate = parseDate(show.opening);
					let endDate = parseDate(show.closing);

					if (!endDate) {
						endDate = new Date();
					}

					if (!startDate) {
						console.warn(`Invalid dates for show: ${showName}`);
						return null;
					}

					const peopleList = show.people
						.map((person) => `<a href="#">${escapeHtml(person.name)} (${escapeHtml(person.position)})</a>`)
						.join("<br>");

					return {
						id: index,
						content: `<div>
						<div>${escapeHtml(showName)}</div>
						<div>${peopleList}</div>
					</div>`,
						start: startDate,
						end: endDate,
						title: escapeHtml(showName),
					};
				})
				.filter(Boolean);

			const nodes = parsed.map((row, index) => ({
				id: index,
				label: row.Name,
				group: row.Era,
			}));

			const edges = parsed.flatMap((row, index) =>
				(row.Works?.split(",") || []).map((work) => ({
					from: index,
					to: parsed.findIndex((r) => r.Name === work.trim()),
				}))
			);

			setTimelineData(timelineItems);
			setNetworkData({ nodes, edges });

			const options = {
				width: "100%",
				height: "100%",
				stack: false,
				showMajorLabels: true,
				showCurrentTime: false,
				zoomMin: 1000 * 60 * 60 * 24 * 30,
				zoomMax: 1000 * 60 * 60 * 24 * 365 * 50,
				type: "range",
				margin: {
					item: {
						horizontal: -1,
					},
				},
			};

			if (timelineRef.current) {
				timelineRef.current.innerHTML = "";
				const timeline = new Timeline(timelineRef.current, timelineItems, options);
				setTimelineInstance(timeline);

				timeline.on("click", (properties) => {
					const element = properties.event.target;

					if (element.tagName === "A") {
						properties.event.preventDefault();
						properties.event.stopPropagation();

						const name = element.textContent.split(" (")[0];
						const personShows = parsed
							.filter((row) => `${row["FIRST NAME"]} ${row["LAST NAME"]}` === name)
							.sort((a, b) => {
								const dateA = parseDate(a["OPENING DATE"]) || new Date(0);
								const dateB = parseDate(b["OPENING DATE"]) || new Date(0);
								return dateA - dateB;
							})
							.map((row) => ({
								show: row["SHOW"],
								position: row["POSITION"],
								dates: `${row["OPENING DATE"]} - ${row["CLOSING DATE"]}`,
							}));

						setModalContent({
							name,
							shows: personShows,
						});
					}
				});
			}
		};

		fetchData();
	}, []);

	// Update the CSS to make the person links more obviously clickable
	useEffect(() => {
		const style = document.createElement("style");
		style.textContent = `
			.show-item {
				padding: 4px;
			}
			.show-title {
				font-weight: bold;
				margin-bottom: 4px;
			}
			.show-people {
				font-size: 0.9em;
				display: none;
			}
			.vis-item.vis-range:hover .show-people,
			.vis-item.vis-range.vis-selected .show-people {
				display: block;
			}
			.person-link {
				color: #0066cc;
				text-decoration: underline;
				cursor: pointer;
				user-select: none;
			}
			.person-link:hover {
				color: #003366;
			}
		`;
		document.head.appendChild(style);
		return () => document.head.removeChild(style);
	}, []);

	useEffect(() => {
		if (networkData.nodes.length > 0 && !networkRef.current) {
			networkRef.current = new Network(
				document.getElementById("network"),
				{
					nodes: networkData.nodes,
					edges: networkData.edges,
				},
				{}
			);
		}
	}, [networkData]);

	return (
		<>
			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					padding: 0,
					margin: 0,
					overflow: "hidden",
				}}
			>
				<div
					ref={timelineRef}
					style={{
						width: "100%",
						height: "100%",
					}}
				/>
				<h2>Composer Relationships</h2>
				<div id="network" style={{ height: "500px" }}></div>
			</div>

			{modalContent && (
				<div
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: "rgba(0, 0, 0, 0.5)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 1000,
					}}
				>
					<div
						style={{
							backgroundColor: "white",
							padding: "20px",
							borderRadius: "8px",
							maxWidth: "600px",
							maxHeight: "80vh",
							overflow: "auto",
							color: "#000",
						}}
					>
						<h2 style={{ color: "#000" }}>{modalContent.name}</h2>
						<div>
							{modalContent.shows.map((show, index) => (
								<div
									key={index}
									style={{
										marginBottom: "20px",
										cursor: "pointer",
										padding: "10px",
										border: "1px solid #eee",
										borderRadius: "4px",
										color: "#000",
										backgroundColor: "#f5f5f5",
										transition: "background-color 0.2s",
									}}
									onClick={() => {
										const matchingItem = timelineData.find((item) =>
											item.content.includes(`>${escapeHtml(show.show)}<`)
										);

										if (matchingItem && timelineInstance) {
											timelineInstance.focus(matchingItem.id);
											timelineInstance.setSelection(matchingItem.id);
											setModalContent(null);
										}
									}}
									onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#e5e5e5")}
									onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#f5f5f5")}
								>
									<div style={{ fontWeight: "bold" }}>{show.show}</div>
									<div>{show.position}</div>
									<div>{show.dates}</div>
								</div>
							))}
						</div>
						<button
							onClick={() => setModalContent(null)}
							style={{
								marginTop: "20px",
								padding: "8px 16px",
								border: "none",
								borderRadius: "4px",
								backgroundColor: "#0066cc",
								color: "white",
								cursor: "pointer",
							}}
						>
							Close
						</button>
					</div>
				</div>
			)}
		</>
	);
}
