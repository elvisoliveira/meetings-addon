import { prettyPrintJson } from 'pretty-print-json';

class MeetingPopup {
    constructor() {
        this.body = document.body;
        this.headerLabel = document.getElementById('meeting-label');
        this.refreshButton = document.getElementById('refresh');
        this.showToggle = document.getElementById('show');
        this.codeDisplay = document.getElementById('code');
        this.copyButton = document.getElementById('copy');
        this.copyStatus = document.getElementById('copyStatus');
        this.downloadButton = document.getElementById('download');
        this.formatRadios = Array.from(document.querySelectorAll('[role="radio"][data-format]'));

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
        this.formatRadios.forEach((button) => {
            button.addEventListener('click', () => this.#handleFormatChange(button.dataset.format));
        });
        this.copyButton.addEventListener('click', () => this.#handleCopyClick());
        this.downloadButton.addEventListener('click', () => this.#handleDownloadClick());
        this.refreshButton.addEventListener('click', () => this.#loadMeetingDataFromActiveTabs());
        window.addEventListener('unload', () => this.#cleanupStorage());
    }

    #setState(state) {
        this.body.className = `state-${state}`;
    }

    #loadShowToggleState() {
        chrome.storage.local.get('show', (data) => {
            this.showToggle.checked = data.show || false;
        });
    }

    #loadResponseTypeState() {
        chrome.storage.local.get('responseType', (data) => {
            this.#setFormat(data.responseType || 'array');
        });
    }

    #setFormat(responseType) {
        this.formatRadios.forEach((button) => {
            button.setAttribute('aria-checked', button.dataset.format === responseType ? 'true' : 'false');
        });
    }

    #getFormat() {
        const checked = this.formatRadios.find((button) => button.getAttribute('aria-checked') === 'true');
        return checked?.dataset.format || 'array';
    }

    #loadMeetingDataFromActiveTabs() {
        this.#setState('loading');
        const contentScriptUrls = chrome.runtime.getManifest().content_scripts.flatMap((script) => script.matches);

        chrome.tabs.query({
            url: contentScriptUrls,
            active: true
        }, (tabs) => this.#handleTabsQuery(tabs));
    }

    #handleTabsQuery(tabs) {
        if (tabs.length === 0) {
            this.#showEmpty();
            return;
        }
        this.#extractMeetingDataFromTabs(tabs);
    }

    #extractMeetingDataFromTabs(tabs) {
        tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, { action: 'getSource' }, (meetingData) => {
                if (!meetingData || meetingData.length === 0) {
                    this.#showEmpty();
                    return;
                }
                this.#saveMeetingDataAndRender(meetingData);
            });
        });
    }

    #saveMeetingDataAndRender(meetingData) {
        chrome.storage.local.set({ meeting: meetingData }, () => {
            this.#setState('ready');
            this.#updateHeaderLabel(meetingData);
            this.#renderMeetingData();
        });
    }

    #showEmpty() {
        this.headerLabel.textContent = '';
        this.#setState('empty');
    }

    #updateHeaderLabel(meetingData) {
        const summary = meetingData
            .map((meeting) => [meeting.label, meeting.week].filter(Boolean).join(' · '))
            .filter(Boolean)
            .join(' / ');
        this.headerLabel.textContent = summary;
    }

    #handleToggleChange(event) {
        chrome.storage.local.set({ show: event.currentTarget.checked });
        this.#renderMeetingData();
    }

    #handleFormatChange(responseType) {
        this.#setFormat(responseType);
        chrome.storage.local.set({ responseType });
        this.#renderMeetingData();
    }

    #handleCopyClick() {
        navigator.clipboard.writeText(this.codeDisplay.innerText).then(() => {
            this.copyStatus.textContent = 'Copied';
            setTimeout(() => { this.copyStatus.textContent = ''; }, 1500);
        });
    }

    #handleDownloadClick() {
        chrome.storage.local.get('meeting', (data) => {
            if (!data.meeting) return;

            const responseType = this.#getFormat();
            const payload = this.#normalizeResponseType(data.meeting, responseType);
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const filename = this.#buildDownloadFilename(data.meeting);

            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
        });
    }

    #buildDownloadFilename(meetingData) {
        const weekTag = meetingData.find((meeting) => meeting.week)?.week;
        return weekTag ? `meetings-${weekTag}.json` : 'meetings.json';
    }

    #renderMeetingData() {
        chrome.storage.local.get('meeting', (data) => {
            const meetingData = data.meeting;
            if (!meetingData) return;

            const shouldFormat = this.showToggle.checked;
            const responseType = this.#getFormat();
            const normalizedMeetingData = shouldFormat
                ? meetingData.map((meeting) => this.#formatMeetingForDisplay(meeting))
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
        return parts.map((part) => ({ ...part, speaker: '' }));
    }

    #formatFieldMinistryParts(parts) {
        return parts.map((part) => ({
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
        const wrapped = parser.parseFromString(`<div>${formattedJson}</div>`, 'text/html');
        this.codeDisplay.replaceChildren(...wrapped.body.firstChild.childNodes);
    }

    #cleanupStorage() {
        chrome.storage.local.remove('meeting');
    }
}

window.addEventListener('load', () => new MeetingPopup());
