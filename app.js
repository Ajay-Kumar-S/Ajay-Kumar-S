const state = {
  parsedMeetingDate: null,
  lastIssueId: null,
  contacts: JSON.parse(localStorage.getItem("synkron_contacts") || "{}"),
  issues: JSON.parse(localStorage.getItem("synkron_issues") || "[]"),
  siteNotes: JSON.parse(localStorage.getItem("synkron_site_notes") || "[]"),
  meetings: JSON.parse(localStorage.getItem("synkron_meetings") || "[]"),
  reportsGenerated: Number(localStorage.getItem("synkron_reports_count") || "0")
};

const issueKB = {
  blower: {
    checks: [
      "Check continuity of the blower.",
      "Check if blower is receiving input power.",
      "Verify COP blower button operation.",
      "Inspect PCB for blower output fault.",
      "If all above are OK, replace the blower."
    ],
    video: "https://www.youtube.com/results?search_query=elevator+blower+troubleshooting"
  },
  door: {
    checks: [
      "Check door sensor alignment and cleanliness.",
      "Verify door motor supply and controller output.",
      "Inspect door lock contacts and wiring.",
      "Calibrate door opening/closing speed in controller settings."
    ],
    video: "https://www.youtube.com/results?search_query=elevator+door+operator+troubleshooting"
  },
  default: {
    checks: [
      "Observe the error safely and note exact symptoms.",
      "Check power supply and protection devices.",
      "Verify related switches/sensors and wiring continuity.",
      "Inspect control PCB indications and logged fault codes.",
      "If unresolved, escalate with recorded details and photos."
    ],
    video: "https://www.youtube.com/results?search_query=elevator+troubleshooting+guide"
  }
};

const el = {
  navBtns: document.querySelectorAll(".nav-btn"),
  navJumpBtns: document.querySelectorAll(".nav-jump"),
  views: document.querySelectorAll(".view"),
  nlInput: document.getElementById("nl-input"),
  parseBtn: document.getElementById("parse-btn"),
  meetingForm: document.getElementById("meeting-form"),
  meetingTime: document.getElementById("meeting-time"),
  agenda: document.getElementById("agenda"),
  attendees: document.getElementById("attendees"),
  emailCollection: document.getElementById("email-collection"),
  scheduleBtn: document.getElementById("schedule-btn"),
  meetingOutput: document.getElementById("meeting-output"),
  issueInput: document.getElementById("issue-input"),
  diagnoseBtn: document.getElementById("diagnose-btn"),
  issueResponse: document.getElementById("issue-response"),
  markResolved: document.getElementById("mark-resolved"),
  markPending: document.getElementById("mark-pending"),
  metrics: document.getElementById("metrics"),
  downloadReport: document.getElementById("download-report"),
  siteChallenges: document.getElementById("site-challenges"),
  saveSiteNote: document.getElementById("save-site-note"),
  siteOutput: document.getElementById("site-output"),
  statSessions: document.getElementById("stat-sessions"),
  statSolved: document.getElementById("stat-solved"),
  statReports: document.getElementById("stat-reports"),
  statMeetings: document.getElementById("stat-meetings"),
  recentActivity: document.getElementById("recent-activity")
};

function switchView(viewId) {
  el.views.forEach((view) => {
    view.classList.toggle("active-view", view.id === viewId);
  });
  el.navBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewId);
  });
}

function saveState() {
  localStorage.setItem("synkron_contacts", JSON.stringify(state.contacts));
  localStorage.setItem("synkron_issues", JSON.stringify(state.issues));
  localStorage.setItem("synkron_site_notes", JSON.stringify(state.siteNotes));
  localStorage.setItem("synkron_meetings", JSON.stringify(state.meetings));
  localStorage.setItem("synkron_reports_count", String(state.reportsGenerated));
}

function parseNaturalDate(input) {
  const text = input.toLowerCase();
  const now = new Date();
  const date = new Date(now);

  if (text.includes("day after tomorrow")) date.setDate(date.getDate() + 2);
  else if (text.includes("tomorrow")) date.setDate(date.getDate() + 1);

  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  let hour = 10;
  let minute = 0;
  if (match) {
    hour = Number(match[1]);
    minute = Number(match[2] || 0);
    if (match[3] === "pm" && hour < 12) hour += 12;
    if (match[3] === "am" && hour === 12) hour = 0;
  }

  date.setHours(hour, minute, 0, 0);
  return date;
}

function renderMissingEmailInputs(names) {
  el.emailCollection.innerHTML = "";
  names.forEach((name) => {
    if (!state.contacts[name]) {
      const id = `email-${name.replace(/\s+/g, "-").toLowerCase()}`;
      el.emailCollection.insertAdjacentHTML(
        "beforeend",
        `<label for="${id}">Email for ${name}</label><input id="${id}" data-name="${name}" placeholder="${name.toLowerCase()}@company.com" />`
      );
    }
  });
}

function scheduleMeeting() {
  const agenda = el.agenda.value.trim();
  const names = el.attendees.value.split(",").map((v) => v.trim()).filter(Boolean);

  if (!state.parsedMeetingDate || !agenda || names.length === 0) {
    el.meetingOutput.textContent = "Please provide meeting time, agenda, and attendee names.";
    return;
  }

  const missingInputs = el.emailCollection.querySelectorAll("input");
  for (const input of missingInputs) {
    const name = input.dataset.name;
    const email = input.value.trim();
    if (!email) {
      el.meetingOutput.textContent = `Please enter email for ${name}.`;
      return;
    }
    state.contacts[name] = email;
  }

  const attendeeRecords = names.map((name) => ({ name, email: state.contacts[name] }));
  state.meetings.push({ id: Date.now(), createdAt: new Date().toISOString(), agenda, attendees: attendeeRecords, start: state.parsedMeetingDate.toISOString() });

  const calendarPayload = { title: agenda, start: state.parsedMeetingDate.toISOString(), attendees: attendeeRecords };
  const emailPayload = attendeeRecords.map((a) => ({
    to: a.email,
    subject: `Meeting Invite: ${agenda}`,
    body: `Hi ${a.name},\n\nYou are invited on ${state.parsedMeetingDate.toLocaleString()}.\nAgenda: ${agenda}\n\nRegards,\nSynkron`
  }));

  saveState();
  renderDashboard();
  el.meetingOutput.textContent =
    "Meeting prepared successfully.\n\n" +
    "Google Calendar payload (ready for API integration):\n" +
    JSON.stringify(calendarPayload, null, 2) +
    "\n\nEmail payload (ready for Gmail API integration):\n" +
    JSON.stringify(emailPayload, null, 2);
}

function identifyIssueKey(text) {
  const t = text.toLowerCase();
  if (t.includes("blower")) return "blower";
  if (t.includes("door")) return "door";
  return "default";
}

function addIssue(status = "pending") {
  const description = el.issueInput.value.trim();
  if (!description) {
    el.issueResponse.textContent = "Please enter an issue.";
    return;
  }

  const key = identifyIssueKey(description);
  const entry = { id: Date.now(), createdAt: new Date().toISOString(), description, key, status };
  state.issues.push(entry);
  state.lastIssueId = entry.id;

  const kb = issueKB[key];
  el.issueResponse.textContent = `Possible checks:\n- ${kb.checks.join("\n- ")}\n\nVideo guide: ${kb.video}`;
  saveState();
  renderMetrics();
  renderDashboard();
}

function updateLastIssueStatus(status) {
  if (!state.lastIssueId) {
    el.issueResponse.textContent = "No recent issue to update. Diagnose an issue first.";
    return;
  }

  const issue = state.issues.find((x) => x.id === state.lastIssueId);
  if (!issue) return;
  issue.status = status;
  saveState();
  renderMetrics();
  renderDashboard();
  el.issueResponse.textContent += `\n\nIssue marked as ${status.toUpperCase()}.`;
}

function renderMetrics() {
  const total = state.issues.length;
  const resolved = state.issues.filter((x) => x.status === "resolved").length;
  const pending = total - resolved;
  const repeats = state.issues.reduce((acc, cur) => {
    acc[cur.key] = (acc[cur.key] || 0) + 1;
    return acc;
  }, {});

  const repeatRows = Object.entries(repeats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(" | ");
  el.metrics.innerHTML = `
    <div><strong>Total issues:</strong> ${total}</div>
    <div><strong>Resolved:</strong> ${resolved}</div>
    <div><strong>Pending:</strong> ${pending}</div>
    <div><strong>Repeated issue categories:</strong> ${repeatRows || "N/A"}</div>
  `;
}

function renderDashboard() {
  const resolved = state.issues.filter((x) => x.status === "resolved").length;
  if (el.statSessions) el.statSessions.textContent = String(state.issues.length + state.meetings.length);
  if (el.statSolved) el.statSolved.textContent = String(resolved);
  if (el.statReports) el.statReports.textContent = String(state.reportsGenerated);
  if (el.statMeetings) el.statMeetings.textContent = String(state.meetings.length);

  const timeline = [
    ...state.issues.map((i) => ({ title: i.description, meta: `ISSUE • ${i.status.toUpperCase()} • ${new Date(i.createdAt).toLocaleString()}`, at: new Date(i.createdAt).getTime() })),
    ...state.meetings.map((m) => ({ title: m.agenda, meta: `MEETING • ${new Date(m.start).toLocaleString()} • ${m.attendees.length} attendees`, at: new Date(m.createdAt).getTime() })),
    ...state.siteNotes.map((n, idx) => ({ title: n, meta: `SITE NOTE • Entry ${idx + 1}`, at: idx + 1 }))
  ].sort((a, b) => b.at - a.at);

  el.recentActivity.innerHTML = timeline.slice(0, 5).map((item) => `<div class="activity-item"><strong>${item.title}</strong><small>${item.meta}</small></div>`).join("");
  if (!el.recentActivity.innerHTML) {
    el.recentActivity.innerHTML = `<div class="activity-item"><strong>No activity yet</strong><small>Start troubleshooting or schedule a meeting.</small></div>`;
  }
}

function downloadReport() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text("Synkron Issue & Site Report", 14, 18);

  doc.setFontSize(11);
  const lines = [
    `Generated: ${new Date().toLocaleString()}`,
    `Total Issues: ${state.issues.length}`,
    `Resolved: ${state.issues.filter((x) => x.status === "resolved").length}`,
    `Pending: ${state.issues.filter((x) => x.status !== "resolved").length}`,
    `Meetings Scheduled: ${state.meetings.length}`,
    "",
    "Recent Issues:"
  ];

  state.issues.slice(-8).forEach((i, idx) => lines.push(`${idx + 1}. [${i.status}] ${i.description} (${new Date(i.createdAt).toLocaleString()})`));
  lines.push("", "Site Notes:");
  state.siteNotes.slice(-6).forEach((n, idx) => lines.push(`${idx + 1}. ${n}`));

  doc.text(lines, 14, 28);
  doc.save("synkron-report.pdf");

  state.reportsGenerated += 1;
  saveState();
  renderDashboard();
}

el.navBtns.forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));
el.navJumpBtns.forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));

el.parseBtn.addEventListener("click", () => {
  const input = el.nlInput.value.trim();
  if (!input) {
    el.meetingOutput.textContent = "Please enter meeting instruction in natural language.";
    return;
  }
  state.parsedMeetingDate = parseNaturalDate(input);
  el.meetingTime.textContent = `Detected meeting time: ${state.parsedMeetingDate.toLocaleString()}`;
  el.meetingForm.classList.remove("hidden");
  const names = el.attendees.value.split(",").map((v) => v.trim()).filter(Boolean);
  renderMissingEmailInputs(names);
});

el.attendees.addEventListener("input", () => {
  const names = el.attendees.value.split(",").map((v) => v.trim()).filter(Boolean);
  renderMissingEmailInputs(names);
});

el.scheduleBtn.addEventListener("click", scheduleMeeting);
el.diagnoseBtn.addEventListener("click", () => addIssue("pending"));
el.markResolved.addEventListener("click", () => updateLastIssueStatus("resolved"));
el.markPending.addEventListener("click", () => updateLastIssueStatus("pending"));
el.downloadReport.addEventListener("click", downloadReport);
el.saveSiteNote.addEventListener("click", () => {
  const note = el.siteChallenges.value.trim();
  if (!note) {
    el.siteOutput.textContent = "Please enter site challenge notes.";
    return;
  }
  state.siteNotes.push(note);
  saveState();
  renderDashboard();
  el.siteOutput.textContent = "Site visit note saved.";
});

renderMetrics();
renderDashboard();
