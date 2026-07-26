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

// Populated by loadScene() before the first render: sceneData[i] = { topArtist, leaderArtist, topTrack, subtitle }
const sceneData = new Array(scenes.length).fill(null);

let sceneIndex = 0;
const DURATION = 750;
TOP_N = 30

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
    .slice(0, TOP_N)
    .map(d => ({
      ...d,
      trackList: parseTrackSet(
        tracks
          .filter(t => t.artistName === d.artistName)
          .filter(t => t.minutesPlayed >= 1)
          .slice(0, 10)
          .map(t => `${t.trackName} (${Math.round(t.minutesPlayed)} min)`)
      ),
    }));

  const leaderArtist = topArtist[0];
  const topTrack = tracks
    .filter(t => t.artistName === leaderArtist.artistName)
    .sort((a, b) => d3.descending(a.minutesPlayed, b.minutesPlayed))[0];

  const leaderMinutes = Math.round(leaderArtist.minutesPlayed);
  const subtitle = topTrack
    ? `${leaderArtist.artistName} led the month with ${leaderMinutes} minutes played, mostly from “${topTrack.trackName}.”`
    : `${leaderArtist.artistName} led the month with ${leaderMinutes} minutes played.`;

  sceneData[i] = { 
    topArtist, 
    leaderArtist, 
    topTrack, 
    subtitle 
  };
  return sceneData[i];
}

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
const maxRadius = Math.min(width, height) / 4;
d3.select("#controls").style("max-width", totalWidth + "px");

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
// No meaningful x/y mapping — charge + collision just spread bubbles apart so
// none overlap, and center pulls the cluster to the middle of the canvas.
const simulation = d3.forceSimulation()
  .force("charge", d3.forceManyBody().strength(5))
  .force("center", d3.forceCenter(width / 2, height / 2))
  .force("collide", d3.forceCollide(d => r(d.minutesPlayed) + 2));

// ---- render one scene ----
function render(instant) {
  const scene = scenes[sceneIndex];
  const cache = sceneData[sceneIndex];
  const rows = cache.topArtist;
  const dur = instant ? 0 : DURATION;

  d3.select("#scene-title").text(scene.title);
  d3.select("#scene-subtitle").text(cache.subtitle);

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
        .attr("opacity", 0),
      update => update,
      exit => exit.transition().duration(dur).attr("opacity", 0).remove()
    )
    .classed("muted", d => d.artistName !== cache.leaderArtist.artistName);

  nameSel.transition().duration(dur)
    .attr("opacity", d => r(d.minutesPlayed) >= 22 ? 1 : 0);

//   const annotationSel = renderAnnotation(cache, rows, dur);
//   const annotationSel = renderAnnotation(cache);
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
    //   annotationSel.select("line")
    //     .attr("x1", d => d.x)
    //     .attr("x2", d => d.x)
    //     .attr("y1", d => d.y - r(d.minutesPlayed) - 6)
    //     .attr("y2", d => d.y - r(d.minutesPlayed) - 18);
    //   annotationSel.select("text")
    //     .attr("x", d => d.x)
    //     .attr("y", d => d.y - r(d.minutesPlayed) - 24);
    })
    .restart();
}

// Annotation: a dashed leader above the top artist's bubble, naming their top track.
// Position is driven by the simulation's tick handler; this only owns content/opacity.
function renderAnnotation_old(cache, rows, dur) {
  const target = rows.find(d => d.artistName === cache.leader.artistName);
  const label = cache.topTrack ? truncate(`Top track: ${cache.topTrack.trackName}`, 34) : "Top artist";
  const shown = target ? [target] : [];

  const g = annotationG.selectAll("g.annotation")
    .data(shown, d => d.artistName)
    .join(
      enter => {
        const gEnter = enter.append("g").attr("class", "annotation").attr("opacity", 0);
        gEnter.append("line").attr("class", "annotation-line");
        gEnter.append("text").attr("class", "annotation-text").attr("text-anchor", "middle");
        return gEnter;
      },
      update => update,
      exit => exit.transition().duration(dur).attr("opacity", 0).remove()
    );

//   g.select("text").text(label);
  g.transition().duration(dur).attr("opacity", 1);

  return g;
}

function renderAnnotation(cache, rows){
    // annotation setup for top tracks for the month
    const sidebarWidth = 180;
    const sidebarPadding = 10;

    const box = svg.append("rect")
        .attr("x", width - sidebarWidth)
        .attr("y", 0)
        .attr("width", sidebarWidth)
        .attr("height", height)
        .attr("rx", 10)
        .attr("fill", "#f0f0f0")   // light grey background
        .attr("stroke", "#ccc")    // optional subtle border
        .attr("stroke-width", 1)
    ;


    svg.selectAll(".track-list-label")
        .data(rows)
        .join("text")
        .attr("class", "track-label")
        .attr("x", width - sidebarWidth + sidebarPadding)
        .attr("y", (d, i) => 20 + i * 18)  // stack each line vertically
        .attr("font-size", "12px")
        .attr("fill", "#333")
        .text(d => d);

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
    .attr("aria-label", (d, i) => `Go to scene ${i + 1}`)
    .classed("active", (d, i) => i === sceneIndex);
}

function goTo(i) {
  const next = Math.max(0, Math.min(scenes.length - 1, i));
  if (next === sceneIndex || sceneData[next] === null) return;
  sceneIndex = next;
  render(false);
}

d3.select("#next").on("click", () => goTo(sceneIndex + 1));
d3.select("#prev").on("click", () => goTo(sceneIndex - 1));

d3.select("body").on("keydown", (event) => {
  if (event.key === "ArrowRight") goTo(sceneIndex + 1);
  if (event.key === "ArrowLeft") goTo(sceneIndex - 1);
});

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
