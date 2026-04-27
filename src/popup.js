import { prettyPrintJson } from 'pretty-print-json';

class MeetingPopup {
    constructor() {
        this.showToggle = document.getElementById('show');
        this.responseType = document.getElementById('responseType');
        this.formContainer = document.getElementById('form');
        this.codeDisplay = document.getElementById('code');
        this.copyButton = document.getElementById('copy');
        
        this.#initialize();
    }

    #initialize() {
        this.#setupEventListeners();
        this.#loadShowToggleState();
        this.#loadResponseTypeState();
        this.#loadMeetingDataFromActiveTabs();
    }

    #setupEventListeners() {
        this.showToggle.addEventListener('change', (e) => this.#handleToggleChange(e));
        this.responseType.addEventListener('change', (e) => this.#handleResponseTypeChange(e));
        this.copyButton.addEventListener('click', () => this.#handleCopyClick());
        window.addEventListener('unload', () => this.#cleanupStorage());
    }

    #loadShowToggleState() {
        chrome.storage.local.get('show', (data) => {
            this.showToggle.checked = data.show || false;
        });
    }

    #loadResponseTypeState() {
        chrome.storage.local.get('responseType', (data) => {
            this.responseType.value = data.responseType || 'array';
        });
    }

    #loadMeetingDataFromActiveTabs() {
        const contentScriptUrls = chrome.runtime.getManifest().content_scripts.flatMap(script => script.matches);
        
        chrome.tabs.query({
            url: contentScriptUrls,
            active: true
        }, (tabs) => this.#handleTabsQuery(tabs));
    }

    #handleTabsQuery(tabs) {
        if (tabs.length > 0) {
            this.#extractMeetingDataFromTabs(tabs);
            this.formContainer.style.display = 'block';
        } else {
            this.#displayErrorMessage();
            this.formContainer.style.display = 'none';
        }
    }

    #extractMeetingDataFromTabs(tabs) {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: 'getSource' }, (meetingData) => {
                this.#saveMeetingDataAndRender(meetingData);
            });
        });
    }

    #saveMeetingDataAndRender(meetingData) {
        chrome.storage.local.set({ meeting: meetingData }, () => {
            this.#renderMeetingData();
        });
    }

    #displayErrorMessage() {
        const errorElement = this.#createErrorElement('You must be in the meetings page');
        this.codeDisplay.appendChild(errorElement);
    }

    #createErrorElement(message) {
        const parser = new DOMParser();
        const errorHtml = `<span id="error">${message}</span>`;
        return parser.parseFromString(errorHtml, 'text/html').body.firstChild;
    }

    #handleToggleChange(event) {
        const isChecked = event.currentTarget.checked;
        this.#saveShowToggleState(isChecked);
        this.#renderMeetingData();
    }

    #saveShowToggleState(isChecked) {
        chrome.storage.local.set({ show: isChecked });
    }

    #handleResponseTypeChange(event) {
        const responseType = event.currentTarget.value;
        this.#saveResponseTypeState(responseType);
        this.#renderMeetingData();
    }

    #saveResponseTypeState(responseType) {
        chrome.storage.local.set({ responseType });
    }

    #handleCopyClick() {
        const textToCopy = this.codeDisplay.innerText;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            this.#showCopyFeedback();
        });
    }

    #showCopyFeedback() {
        const originalText = this.copyButton.textContent;
        this.copyButton.textContent = "Done!";
        
        setTimeout(() => {
            this.copyButton.textContent = originalText;
        }, 1000);
    }

    #renderMeetingData() {
        chrome.storage.local.get('meeting', (data) => {
            const meetingData = data.meeting;
            if (!meetingData) return;

            const shouldFormat = this.showToggle.checked;
            const responseType = this.responseType.value;
            const normalizedMeetingData = shouldFormat
                ? meetingData.map(meeting => this.#formatMeetingForDisplay(meeting))
                : meetingData;
            const dataToRender = this.#normalizeResponseType(normalizedMeetingData, responseType);
            const formattedJson = this.#generateFormattedJson(dataToRender);
            
            this.#updateCodeDisplay(formattedJson);
        });
    }

    #normalizeResponseType(meetingData, responseType) {
        if (responseType === 'object' && meetingData.length === 1) {
            return meetingData[0];
        }

        return meetingData;
    }

    #formatMeetingForDisplay(meeting) {
        return {
            week: meeting.week,
            label: meeting.label,
            theme: meeting.theme,
            chairman: '',
            opening_song: meeting.opening_song,
            opening_talk: this.#addSpeakerField(meeting.opening_talk),
            spiritual_gems: this.#addConductorField(meeting.spiritual_gems),
            bible_reading: this.#addReaderField(meeting.bible_reading),
            apply_yourself_to_the_field_ministry: this.#formatFieldMinistryParts(meeting.apply_yourself_to_the_field_ministry),
            middle_song: meeting.middle_song,
            living_as_christians: this.#addSpeakerFieldToArray(meeting.living_as_christians),
            congregation_bible_study: this.#addConductorAndReaderFields(meeting.congregation_bible_study),
            closing_song: meeting.closing_song,
            closing_prayer: ''
        };
    }

    #addSpeakerField(part) {
        return { ...part, speaker: '' };
    }

    #addConductorField(part) {
        return { ...part, conductor: '' };
    }

    #addReaderField(part) {
        return { ...part, reader: '' };
    }

    #addConductorAndReaderFields(part) {
        return { ...part, conductor: '', reader: '' };
    }

    #addSpeakerFieldToArray(parts) {
        return parts.map(part => ({ ...part, speaker: '' }));
    }

    #formatFieldMinistryParts(parts) {
        return parts.map(part => ({
            ...part,
            assigned: '',
            assistant: this.#shouldHaveAssistant(part) ? '' : undefined
        }));
    }

    #shouldHaveAssistant(part) {
        return part.lesson && !part.theme;
    }

    #generateFormattedJson(data) {
        return prettyPrintJson.toHtml(data, {
            indent: 2,
            quoteKeys: true,
            trailingCommas: false
        });
    }

    #updateCodeDisplay(formattedJson) {
        const parser = new DOMParser();
        const htmlContent = `<div>${formattedJson}</div>`;
        const parsedContent = parser.parseFromString(htmlContent, 'text/html');
        
        parsedContent.body.childNodes.forEach(node => {
            this.codeDisplay.replaceChildren(node);
        });
    }

    #cleanupStorage() {
        chrome.storage.local.remove('meeting');
    }
}

// Initialize the popup when the page loads
window.addEventListener('load', () => new MeetingPopup());
