// Time conversion utilities
function secondsToTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function timeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(":").map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
}

// DOM elements
const startInput = document.getElementById("start");
const endInput = document.getElementById("end");
const startSlider = document.getElementById("startSlider");
const endSlider = document.getElementById("endSlider");
const startDisplay = document.getElementById("startDisplay");
const endDisplay = document.getElementById("endDisplay");
const startMaxLabel = document.getElementById("startMaxLabel");
const endMaxLabel = document.getElementById("endMaxLabel");
const setRangeBtn = document.getElementById("setRange");
const loopRangeBtn = document.getElementById("loopRange");
const statusDiv = document.getElementById("status");

// Loop state
let isLooping = false;
let loopInterval = null;

// Initialize displays
function updateDisplays() {
  startDisplay.textContent = secondsToTime(startSlider.value);
  endDisplay.textContent = secondsToTime(endSlider.value);
}

// Get video duration from current tab
async function getVideoDuration() {
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const video = document.querySelector("video");
        if (video && !isNaN(video.duration)) {
          return Math.floor(video.duration);
        }
        return null;
      }
    });
    
    return result[0].result;
  } catch (error) {
    console.log("Error getting video duration:", error);
    return null;
  }
}

// Update slider max values based on video duration
async function updateSliderLimits() {
  const videoDuration = await getVideoDuration();
  
  if (videoDuration && videoDuration > 0) {
    // Set max values for sliders
    startSlider.max = videoDuration;
    endSlider.max = videoDuration;
    
    // Update max labels
    const maxTime = secondsToTime(videoDuration);
    startMaxLabel.textContent = maxTime;
    endMaxLabel.textContent = maxTime;
    
    // Set end slider to max value initially
    endSlider.value = videoDuration;
    endInput.value = maxTime;
    endDisplay.textContent = maxTime;
    
    showStatus(`Video detected: ${maxTime}`, "success");
  } else {
    // Default to 10 minutes if no video detected
    startSlider.max = 600;
    endSlider.max = 600;
    startMaxLabel.textContent = "10:00";
    endMaxLabel.textContent = "10:00";
    
    // Set end slider to max value initially
    endSlider.value = 600;
    endInput.value = "10:00";
    endDisplay.textContent = "10:00";
    
    showStatus("No video detected, using default 10-minute range", "error");
  }
}

// Sync text input to slider
function syncTextToSlider(textInput, slider, display) {
  const seconds = timeToSeconds(textInput.value);
  const maxSeconds = parseInt(slider.max);
  
  if (seconds >= 0 && seconds <= maxSeconds) {
    slider.value = seconds;
    display.textContent = textInput.value || secondsToTime(seconds);
  }
}

// Sync slider to text input
function syncSliderToText(slider, textInput, display) {
  const timeStr = secondsToTime(slider.value);
  textInput.value = timeStr;
  display.textContent = timeStr;
}

// Event listeners for text inputs
startInput.addEventListener("input", () => {
  syncTextToSlider(startInput, startSlider, startDisplay);
});

endInput.addEventListener("input", () => {
  syncTextToSlider(endInput, endSlider, endDisplay);
});

// Event listeners for sliders
startSlider.addEventListener("input", () => {
  syncSliderToText(startSlider, startInput, startDisplay);
});

endSlider.addEventListener("input", () => {
  syncSliderToText(endSlider, endInput, endDisplay);
});

// Initialize on popup load
async function initializePopup() {
  await updateSliderLimits();
  updateDisplays();
}

// Set range button functionality
setRangeBtn.addEventListener("click", async () => {
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const start = startInput.value;
    const end = endInput.value;

    if (!start || !end) {
      showStatus("Please enter both start and end times", "error");
      return;
    }

    const startSec = timeToSeconds(start);
    const endSec = timeToSeconds(end);

    if (startSec >= endSec) {
      showStatus("Start time must be before end time", "error");
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: setTimestampRange,
      args: [start, end],
    });

    showStatus("Range set successfully!", "success");
  } catch (error) {
    showStatus("Error: " + error.message, "error");
  }
});

// Loop button functionality
loopRangeBtn.addEventListener("click", async () => {
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const start = startInput.value;
    const end = endInput.value;

    if (!start || !end) {
      showStatus("Please enter both start and end times", "error");
      return;
    }

    const startSec = timeToSeconds(start);
    const endSec = timeToSeconds(end);

    if (startSec >= endSec) {
      showStatus("Start time must be before end time", "error");
      return;
    }

    if (!isLooping) {
      // Start looping
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: startLooping,
        args: [start, end],
      });
      
      isLooping = true;
      loopRangeBtn.textContent = "Stop Loop";
      loopRangeBtn.classList.add("active");
      showStatus("Loop started!", "info");
    } else {
      // Stop looping
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: stopLooping,
        args: [],
      });
      
      isLooping = false;
      loopRangeBtn.textContent = "Loop";
      loopRangeBtn.classList.remove("active");
      showStatus("Loop stopped!", "info");
    }
  } catch (error) {
    showStatus("Error: " + error.message, "error");
  }
});

// Status display function
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  
  setTimeout(() => {
    statusDiv.className = "status";
  }, 3000);
}

function setTimestampRange(start, end) {
  function parseTime(t) {
    const parts = t.split(":").map(Number);
    return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
  }

  const startSec = parseTime(start);
  const endSec = parseTime(end);
  const video = document.querySelector("video");

  if (!video) {
    console.log("No video found on page");
    return;
  }

  video.currentTime = startSec;
  video.play();

  const onTimeUpdate = () => {
    if (video.currentTime >= endSec) {
      video.pause();
      video.removeEventListener("timeupdate", onTimeUpdate);
    }
  };

  video.addEventListener("timeupdate", onTimeUpdate);
}

function startLooping(start, end) {
  function parseTime(t) {
    const parts = t.split(":").map(Number);
    return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
  }

  const startSec = parseTime(start);
  const endSec = parseTime(end);
  const video = document.querySelector("video");

  if (!video) {
    console.log("No video found on page");
    return;
  }

  // Store loop data on video element
  video.loopData = { startSec, endSec, isLooping: true };

  const loopFunction = () => {
    if (!video.loopData || !video.loopData.isLooping) {
      return;
    }

    if (video.currentTime >= video.loopData.endSec) {
      video.currentTime = video.loopData.startSec;
      video.play();
    }
  };

  // Set initial position and start playing
  video.currentTime = startSec;
  video.play();

  // Add event listener for looping
  video.addEventListener("timeupdate", loopFunction);
  
  // Store the loop function for later removal
  video.loopFunction = loopFunction;
}

function stopLooping() {
  const video = document.querySelector("video");
  
  if (!video) {
    console.log("No video found on page");
    return;
  }

  // Stop looping
  if (video.loopData) {
    video.loopData.isLooping = false;
  }

  // Remove event listener
  if (video.loopFunction) {
    video.removeEventListener("timeupdate", video.loopFunction);
    video.loopFunction = null;
  }

  // Pause video
  video.pause();
}

// Initialize when popup loads
document.addEventListener('DOMContentLoaded', initializePopup);
