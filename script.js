function readCsv(file_path){
    return d3.csv(file_path, d3.autoType)
}

function getSceneObj(month, year) {
    const monthToIndex = {
        January: 1,
        February: 2,
        March: 3,
        April: 4,
        May: 5,
        June: 6,
        July: 7,
        August: 8,
        September: 9,
        October: 10,
        November: 11,
        December: 12,
        };

    const index = monthToIndex[month];
    if (!index) {
        throw new Error(`Unknown month: ${month}`);
    }
    
    const artists_file_name = `artists_${index}_${year}.csv`;
    const tracks_file_name = `tracks_${index}_${year}.csv`;

    const artists_file_path = `data/preprocessed_data/${artists_file_name}`;
    const tracks_file_path = `data/preprocessed_data/${tracks_file_name}`;
    return {
        title: `${month} ${year}`,
        artists: readCsv(artists_file_path),
        tracks:  readCsv(tracks_file_path)
    };
}


function truncate(text, max) {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function escapeHtml(text) {
  return text.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// The artists CSV stores each artist's tracks as a Python set repr, e.g.
// {'Shiva', 'Bear'} or, when a title contains an apostrophe, {"It's Over"}.
// Pull out each quoted element regardless of which quote character wraps it.
function parseTrackSet(raw) {
  if (!raw || !raw.length) return [];
  return [...raw].sort((a, b) => d3.descending(a.minutesPlayed, b.minutesPlayed));
}


// Load one month's artists + tracks, and derive everything a scene needs to render.
async function loadScene(i) {
  const [artists, tracks] = await Promise.all([scenes[i].artists, scenes[i].tracks]);

  // for all artists, fetch the top tracks for each 
  const topArtist = [...artists]
    .sort((a, b) => d3.descending(a.minutesPlayed, b.minutesPlayed))
    .slice(0, 25)
    .map(d => ({
      ...d,
      trackList: parseTrackSet(
        tracks
          .filter(t => t.artistName === d.artistName)
          .filter(t => t.minutesPlayed >= 1)
          .slice(0, 10) // keep top 10 songs for each artist
          .map(t => `${t.trackName} (${Math.round(t.minutesPlayed)} min)`)
      ),
    }));

  const leaderArtist = topArtist[0];
  const topTracks = tracks
    .sort((a, b) => d3.descending(a.minutesPlayed, b.minutesPlayed))
    .slice(0, 25);
  
  const totalMinutesPlayed = d3.sum(tracks, t => t.minutesPlayed);

  const topTrackFromArtist = topTracks.filter(t => t.artistName == leaderArtist.artistName)[0];
  const leaderMinutes = Math.round(leaderArtist.minutesPlayed);
  const subtitle = `Total Monthly Playtime: ${Math.round(totalMinutesPlayed)} min<br>
  ${leaderArtist.artistName} led the month with ${leaderMinutes} minutes played, mostly from "${topTrackFromArtist.trackName}."`;
  

  sceneData[i] = {
    topArtist: topArtist,
    leaderArtist: leaderArtist,
    topTracks: topTracks,
    topTrack: topTrackFromArtist,
    subtitle: subtitle,
  };
  return sceneData[i];
}


// ---- render one scene ----
function render(instant) {
  const scene = scenes[sceneIndex];
  const cache = sceneData[sceneIndex];
  const rows = cache.topArtist;
  const dur = instant ? 0 : DURATION;

  d3.select("#dashboard-title").text("Spotify Music Dashboard");
  d3.select("#scene-title").text(scene.title);
  d3.select("#scene-subtitle").html(cache.subtitle);

  // Nodes entering for the first time start unpositioned (undefined x/y) so
  // the simulation drops them in fresh; nodes reused from a prior visit to
  // this scene keep whatever x/y they settled at last time.
  const bubbleSel = bubblesG.selectAll("circle.bubble")
    .data(rows, d => d.artistName)
    .join(
      enter => enter.append("circle")
        .attr("class", "bubble")
        .attr("r", 0)
        .on("mouseover", (event, d) => {
          const list = d.trackList.length
            ? `<ul>${d.trackList.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
            : "<em>No tracks recorded</em>";
          tooltip.style("opacity", 1).html(`<strong>${escapeHtml(d.artistName)} (${Math.round(d.minutesPlayed)} min)</strong>${list}`);
        })
        .on("mousemove", (event) => {
          tooltip.style("left", (event.pageX + 10) + "px")
                 .style("top", (event.pageY - 20) + "px");
        })
        .on("mouseout", () => {
          tooltip.style("opacity", 0);
        }),
      update => update,
      exit => exit.transition().duration(dur)
        .attr("r", 0)
        .attr("opacity", 0)
        .remove()
    )
    .classed("muted", d => d.artistName !== cache.leaderArtist.artistName);

  bubbleSel.transition().duration(dur).attr("r", d => r(d.minutesPlayed));

  // Direct value label inside each bubble, but only where it actually fits.
  const valueSel = bubblesG.selectAll("text.bubble-value")
    .data(rows, d => d.artistName)
    .join(
      enter => enter.append("text")
        .attr("class", "bubble-value")
        .attr("dy", "0.32em")
        .attr("opacity", 0),
      update => update,
      exit => exit.transition().duration(dur).attr("opacity", 0).remove()
    )
    .text(d => d.artistName)
    .classed("muted", d => d.artistName !== cache.leaderArtist.artistName);

  valueSel.transition().duration(dur)
    .attr("opacity", d => r(d.minutesPlayed) >= 16 ? 1 : 0);

  // Artist name above the bubble — the only identity cue now that there's no axis.
  const nameSel = bubblesG.selectAll("text.bubble-name")
    .data(rows, d => d.artistName)
    .join(
      enter => enter.append("text")
        .attr("class", "bubble-name")
        .attr("opacity", 0)
        ,
      update => update,
      exit => exit.transition().duration(dur).attr("opacity", 0).remove()
    )
    .classed("muted", d => d.artistName !== cache.leaderArtist.artistName);

  nameSel.transition().duration(dur)
    .attr("opacity", d => r(d.minutesPlayed) >= 22 ? 1 : 0);

  renderAnnotation(cache);
  renderControls();

  // ---- force layout ----
  simulation
    .nodes(rows)
    .alpha(1)
    .alphaDecay(0.02)
    .on("tick", () => {
      bubbleSel
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);
      valueSel
        .attr("x", d => d.x)
        .attr("y", d => d.y);
      nameSel
        .attr("x", d => d.x)
        .attr("y", d => d.y - r(d.minutesPlayed) - 6);
    })
    .restart();
}

function renderAnnotation(cache){
    // annotation setup for top tracks for the month
    const sidebarPadding = 10;
    const sidebarX = chartWidth + sidebarGap;
    const topTracks = cache.topTracks;
    const sideBarheight = height - 70;

    const box = svg.append("rect")
        .attr("x", sidebarX)
        .attr("y", 0)
        .attr("width", sidebarWidth)
        .attr("height", sideBarheight)
        .attr("rx", 10)
        .attr("fill", "#f0f0f0")   // light grey background
        .attr("stroke", "#ccc")    // optional subtle border
        .attr("stroke-width", 1)
    ;

    svg.append("text")
        .attr("class", "sidebar-title")
        .attr("x", sidebarX + sidebarPadding)
        .attr("y", 24)
        .attr("font-size", "14px")
        .attr("font-weight", "600")
        .attr("fill", "#333")
        .text("Top Tracks this Month");

    svg.selectAll(".track-list-label")
        .data(topTracks)
        .join("text")
        .attr("class", "track-label")
        .attr("x", sidebarX + sidebarPadding)
        .attr("y", (d, i) => 50 + i * 18)
        .attr("font-size", "12px")
        .attr("fill", "#333")
        .text(track => `${truncate(track.trackName, 20)} - ${truncate(track.artistName, 20)}`);

}

// ---- controls ----
function renderControls() {
  d3.select("#prev").property("disabled", sceneIndex === 0);
  d3.select("#next").property("disabled", sceneIndex === scenes.length - 1);
  d3.select("#scene-progress").text(`Scene ${sceneIndex + 1} of ${scenes.length}`);

  d3.select("#scene-dots").selectAll("button.dot")
    .data(scenes)
    .join(enter => enter.append("button")
      .attr("class", "dot")
      .attr("type", "button")
      .on("click", (event, d) => goTo(scenes.indexOf(d))))
    .text((d, i) => i+1)
    .classed("active", (d, i) => i === sceneIndex);
}

function goTo(i) {
  const next = Math.max(0, Math.min(scenes.length - 1, i));
  if (next === sceneIndex || sceneData[next] === null) return;
  sceneIndex = next;
  render(false);
}

const scenes = [
    getSceneObj("July", 2025),
    getSceneObj("August", 2025),
    getSceneObj("September", 2025),
    getSceneObj("October", 2025),
    getSceneObj("November", 2025),
    getSceneObj("December", 2025),
    getSceneObj("January", 2026),
    getSceneObj("February", 2026),
    getSceneObj("March", 2026),
    getSceneObj("April", 2026),
    getSceneObj("May", 2026),
    getSceneObj("June", 2026),
    getSceneObj("July", 2026),
];

const sceneData = new Array(scenes.length).fill(null);

let sceneIndex = 0;
const DURATION = 750;


// ---- dimensions ----
// No axes — position carries no meaning here, only the force layout keeping
// bubbles from overlapping. The canvas is set in a fixed coordinate system,
// then scaled to fill the page via the SVG's viewBox (see below) so it grows
// with the browser window instead of staying pinned to one pixel size.
const margin = { top: 50, right: 20, bottom: 20, left: 20 };
const width = 1100 - margin.left - margin.right;
const height = 640 - margin.top - margin.bottom;
const totalWidth = width + margin.left + margin.right;
const totalHeight = height + margin.top + margin.bottom;
d3.select("#controls").style("max-width", totalWidth + "px");

// The right side of the canvas is reserved for the top-tracks sidebar drawn in
// renderAnnotation(). Bubbles are confined to chartWidth (not the full width)
// so the force layout never places one underneath the sidebar.
const sidebarWidth = 300;
const sidebarGap = 20;
const chartWidth = width - sidebarWidth - sidebarGap;
const maxRadius = Math.min(chartWidth, height) / 4;

// ---- svg setup ----
const svg = d3.select("#chart")
  .attr("viewBox", `0 0 ${totalWidth} ${totalHeight}`)
  .attr("preserveAspectRatio", "xMidYMid meet")
  .style("max-width", totalWidth + "px")
  .append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);


// ---- scales ----
// r's domain is fixed once, after every month has loaded, so a bubble of a
// given size always means the same number of minutes across every scene. Area,
// not radius, scales with value — hence scaleSqrt, not scaleLinear.
const r = d3.scaleSqrt()
  .range([6, maxRadius]);

// ---- static layers (drawn once, updated per scene) ----
const bubblesG = svg.append("g");
const annotationG = svg.append("g");

// ---- tooltip ----
const tooltip = d3.select(".tooltip");

// ---- force layout ----
const simulation = d3.forceSimulation()
  .force("charge", d3.forceManyBody().strength(5))
  .force("center", d3.forceCenter(chartWidth / 2, height / 2))
  .force("collide", d3.forceCollide(d => r(d.minutesPlayed) + 2));

d3.select("#next").on("click", () => goTo(sceneIndex + 1));
d3.select("#prev").on("click", () => goTo(sceneIndex - 1));


// ---- boot ----
// Preload every month up front (small files) so nav between scenes never has
// to wait on a fetch, then fix the radius scale to the largest bubble across
// all of them so size stays comparable from scene to scene.
(async function boot() {
  d3.select("#scene-title").text("Loading…");
  d3.select("#prev").property("disabled", true);
  d3.select("#next").property("disabled", true);

  await Promise.all(scenes.map((_, i) => loadScene(i)));

  const globalMax = d3.max(sceneData, s => d3.max(s.topArtist, d => d.minutesPlayed));
  r.domain([0, globalMax]);

  render(true);
  
})();
