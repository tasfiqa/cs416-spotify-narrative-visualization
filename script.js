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
  if (text.length > max) {
    return text.slice(0, max - 1) + "…";
  } else {
    return text;
  }
}

// Load one month's artists + tracks, and derive data for scene to render
async function loadScene(i, storylines) {
  const [artists, tracks] = await Promise.all([scenes[i].artists, scenes[i].tracks]);
  const keys = Object.keys(storylines);
  const storyline = storylines[keys[i]];
  // for all artists, fetch the top tracks for each 
  const topArtists = [...artists]
    .sort((a, b) => d3.descending(a.minutesPlayed, b.minutesPlayed))
    .slice(0, 25)
    .map(d => ({
      ...d,
      trackList: tracks
      .filter(t => t.artistName === d.artistName)
      .filter(t => t.minutesPlayed >= 1)
      .sort((a, b) => d3.descending(a.minutesPlayed, b.minutesPlayed))
      .slice(0, 10)
      .map(t => `${t.trackName} (${Math.round(t.minutesPlayed)} min)`),
    }));

  const leaderArtist = topArtists[0];
  const topTracks = tracks
    .sort((a, b) => d3.descending(a.minutesPlayed, b.minutesPlayed))
    .slice(0, 25);
  
  const totalMinutesPlayed = d3.sum(tracks, t => t.minutesPlayed);

  const topTrackFromArtist = topTracks.filter(t => t.artistName == leaderArtist.artistName)[0];
  const leaderMinutes = Math.round(leaderArtist.minutesPlayed);

  const annotation = create_annotation(
    storyline,
    totalMinutesPlayed, 
    leaderArtist,
    leaderMinutes,
    topTrackFromArtist
  )  

  sceneData[i] = {
    topArtists: topArtists,
    leaderArtist: leaderArtist,
    topTracks: topTracks,
    topTrack: topTrackFromArtist,
    totalMinutesPlayed: totalMinutesPlayed,
    leaderArtist: leaderArtist,
    leaderMinutes: leaderMinutes,
    topTrackFromArtist: topTrackFromArtist,
    annotation: annotation
  };
  return sceneData[i];

}

function create_annotation(
  storyline,
  totalMinutesPlayed, 
  leaderArtist,
  leaderMinutes,
  topTrackFromArtist
){
  const line1 = `Total Monthly Playtime: ${Math.round(totalMinutesPlayed)} min`
  const line2 = `${leaderArtist.artistName} led the month with ${leaderMinutes} minutes played, mostly from "${topTrackFromArtist.trackName}."`;
  const line3 = `${storyline}`;
  return [line1, line2, line3].join("<br>");

}

// ---- render one scene ----
function render(instant) {
  const scene = scenes[sceneIndex];
  const cache = sceneData[sceneIndex];
  const rows = cache.topArtists;
  const dur = instant ? 0 : DURATION;

  d3.select("#dashboard-title").text("Spotify Music Dashboard");
  d3.select("#scene-title").text(scene.title);
  d3.select("#scene-subtitle").html(cache.annotation);

  const bubbleSel = bubblesG.selectAll("circle.bubble")
    .data(rows, d => d.artistName)
    .join(
      enter => enter.append("circle")
        .attr("class", "bubble")
        .attr("r", 0)
        .on("mouseover", (event, d) => {
          const list = d.trackList.length
            ? `<ul>${d.trackList.map(t => `<li>${t}</li>`).join("")}</ul>`
            : "<em>No tracks recorded</em>";
          tooltip.style("opacity", 1).html(`<strong>${d.artistName} (${Math.round(d.minutesPlayed)} min)</strong>${list}`);
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

  // reset opacity of circles from old scenes
  bubbleSel.interrupt().transition().duration(dur)
    .attr("r", d => r(d.minutesPlayed))
    .attr("opacity", 1);

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

  // artist name in bubble
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

  renderControls();

  // bubble chart layout
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

const margin = { top: 36, right: 20, bottom: 14, left: 14 };
const width = 1920 - margin.left - margin.right;
const height = 1080 - margin.top - margin.bottom;
const totalWidth = width + margin.left + margin.right;
const totalHeight = height + margin.top + margin.bottom;
d3.select("#controls").style("max-width", totalWidth + "px");

// right side for sidebar with top tracks
const chartWidth = width;
const maxRadius = Math.min(chartWidth, height) / 4;

const svg = d3.select("#chart")
  .attr("viewBox", `0 0 ${totalWidth} ${totalHeight}`)
  .attr("preserveAspectRatio", "xMidYMid meet")
  .style("max-width", totalWidth + "px")
  .append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);


// use radius as area grows with minutes played
const r = d3.scaleSqrt()
  .range([6, maxRadius]);

// common elements
const bubblesG = svg.append("g");
const tooltip = d3.select(".tooltip");

// bubble chart render
const simulation = d3.forceSimulation()
  .force("charge", d3.forceManyBody().strength(5))
  .force("center", d3.forceCenter(chartWidth / 2, height / 2))
  .force("collide", d3.forceCollide(d => r(d.minutesPlayed) + 2));

d3.select("#next").on("click", () => goTo(sceneIndex + 1));
d3.select("#prev").on("click", () => goTo(sceneIndex - 1));


// boot func
(async function boot() {
  d3.select("#scene-title").text("Loading…");
  d3.select("#prev").property("disabled", true);
  d3.select("#next").property("disabled", true);

  const storylines = await d3.json("data/preprocessed_data/storylines.json");
  // load scenes in advance
  await Promise.all(scenes.map((_, i) => loadScene(i, storylines)));

  const globalMax = d3.max(sceneData, s => d3.max(s.topArtists, d => d.minutesPlayed));
  r.domain([0, globalMax]);

  render(true);
})();
