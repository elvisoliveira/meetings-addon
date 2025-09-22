class MeetingExtractor {
    #MEETING_SECTIONS = {
        gem: 'dc-icon--gem',     // Treasures from God's Word
        wheat: 'dc-icon--wheat', // Apply Yourself to the Field Ministry
        sheep: 'dc-icon--sheep'  // Living as Christians
    };

    constructor() {
        this.#setupMessageListener();
    }

    #setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'getSource') {
                const meetings = this.#extractAllMeetings();
                sendResponse(meetings);
            }
        });
    }

    #extractAllMeetings() {
        const meetingElements = document.querySelectorAll('div.pub-mwb:not(:has(> div#f1))');
        return Array.from(meetingElements).map(element => this.#extractSingleMeeting(element));
    }

    #extractSingleMeeting(meetingElement) {
        const meetingData = {
            label: this.#getTextContent('[data-pid="1"]', meetingElement),
            theme: this.#getTextContent('[data-pid="2"]', meetingElement),
            songs: this.#extractSongs(meetingElement),
            gem: [],
            wheat: [],
            sheep: []
        };

        this.#parseMeetingParts(meetingElement, meetingData);

        return this.#buildMeetingStructure(meetingData);
    }

    #extractSongs(meetingElement) {
        const songElements = meetingElement.querySelectorAll('.dc-icon--music strong:first-child');
        return Array.from(songElements).map(element => this.#parseSongNumber(element.textContent));
    }

    #parseMeetingParts(meetingElement, meetingData) {
        const bodyElements = meetingElement.querySelector('div.bodyTxt').querySelectorAll('div, h3');
        let currentSection = null;

        Array.from(bodyElements).forEach(element => {
            const sectionName = this.#findSectionFromElement(element);
            if (sectionName) {
                currentSection = sectionName;
                return;
            }

            if (currentSection && this.#isNumberedMeetingPart(element)) {
                const partData = this.#extractMeetingPart(element);
                if (partData) {
                    meetingData[currentSection].push(partData);
                }
            }
        });
    }

    #findSectionFromElement(element) {
        for (const [sectionName, iconClass] of Object.entries(this.#MEETING_SECTIONS)) {
            if (element.classList.contains(iconClass)) {
                return sectionName;
            }
        }
        return null;
    }

    #isNumberedMeetingPart(element) {
        const isHeading = element.tagName === 'H3';
        const isBaseDiv = element.tagName === 'DIV' && element.classList.contains('du-fontSize--base');
        // Match lines starting with digits followed by a dot (e.g., "1.", "10.")
        const hasNumberPrefix = /^\d+\./.test(element.textContent.trim());

        return (isHeading || isBaseDiv) && hasNumberPrefix;
    }

    #extractMeetingPart(element) {
        const titleText = element.textContent.trim();
        const descriptionElement = element.nextElementSibling;

        if (!descriptionElement) return null;

        const descriptionText = descriptionElement.textContent.trim();
        // Extract part number and title from "1. Title text"
        const titleMatch = titleText.match(/^(\d+)\.(.*)/);
        // Extract time and description from "(5 min) Additional info text"
        const descriptionMatch = descriptionText.match(/^\(([^()]*)\)\s*([^]*)/);

        if (!titleMatch || !descriptionMatch) return null;

        const partNumber = this.#extractDigits(titleMatch[1]);
        const partTitle = titleMatch[2].trim();
        const timeAllocation = this.#extractDigits(descriptionMatch[1]);
        const additionalInfo = descriptionMatch[2]?.trim() || '';

        const part = {
            number: partNumber,
            title: partTitle,
            time: timeAllocation
        };

        if (additionalInfo) {
            this.#addLessonAndAssignmentInfo(part, additionalInfo, partNumber);
        }

        return part;
    }

    #addLessonAndAssignmentInfo(part, additionalInfo, partNumber) {
        // Extract lesson reference from text ending with "(lmd p. 123)" or "(th study 15)"
        const lessonMatch = additionalInfo.match(/([^]*)\(((?:lmd|th).*)\)$/);
        if (!lessonMatch) return;

        part.lesson = lessonMatch[2].trim();
        const assignmentText = lessonMatch[1].trim();

        if (partNumber === 3) {
            part.assignment = assignmentText;
        } else {
            // Extract theme from talk format "Title. Context—Setting: Theme text"
            const talkMatch = assignmentText.match(/(^[^.]*).(?:.*)\—(?:[^]*)\: (.*)$/);
            if (this.#isTalkAssignment(part.title) || (talkMatch && this.#isTalkAssignment(talkMatch[1]))) {
                part.theme = talkMatch?.[2]?.trim();
            }
        }
    }

    #buildMeetingStructure(meetingData) {
        const structure = {
            week: this.#getElement('#todayWeek')?.value || null,
            label: meetingData.label,
            theme: meetingData.theme,
            opening_song: meetingData.songs[0],
            opening_talk: meetingData.gem[0],
            spiritual_gems: meetingData.gem[1],
            bible_reading: meetingData.gem[2],
            apply_yourself_to_the_field_ministry: meetingData.wheat,
            middle_song: meetingData.songs[1],
            living_as_christians: meetingData.sheep.slice(0, -1),
            congregation_bible_study: meetingData.sheep[meetingData.sheep.length - 1],
            closing_song: meetingData.songs[2]
        };

        return this.#removeNullValues(structure);
    }

    #removeNullValues(obj) {
        return Object.entries(obj).reduce((result, [key, value]) => {
            if (value !== null) {
                result[key] = value;
            }
            return result;
        }, {});
    }

    #isTalkAssignment(title) {
        return ['Talk', 'Discurso'].includes(title);
    }

    #getTextContent(selector, baseElement) {
        return this.#getElement(selector, baseElement)?.textContent || '';
    }

    #getElement(selector, baseElement) {
        return (baseElement || document).querySelector(selector);
    }

    #extractDigits(text) {
        // Remove all non-digit characters and convert to number
        return +text.replace(/\D/g, '');
    }

    #parseSongNumber(text) {
        const songNumber = this.#extractDigits(text);
        return songNumber >= 1 && songNumber <= 161 ? songNumber : '-';
    }
}

// Initialize the meeting extractor when the content script loads
new MeetingExtractor();