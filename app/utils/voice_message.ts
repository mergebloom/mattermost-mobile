// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {File} from 'expo-file-system';

import {generateId} from '@utils/general';

export const MAX_VOICE_MESSAGE_DURATION_MS = 5 * 60 * 1000;

export function formatVoiceMessageDuration(durationMillis: number) {
    const totalSeconds = Math.max(0, Math.floor(durationMillis / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
}

export function voiceRecordingToFileInfo(uri: string, createdAt = Date.now()): FileInfo {
    const info = new File(uri).info();
    if (!info.exists) {
        throw new Error('Voice recording file is unavailable');
    }

    return {
        clientId: generateId(),
        extension: 'm4a',
        has_preview_image: false,
        height: 0,
        localPath: uri,
        mime_type: 'audio/mp4',
        name: `voice-message-${createdAt}.m4a`,
        size: info.size || 0,
        user_id: '',
        width: 0,
    };
}

export function removeVoiceRecording(uri?: string | null) {
    if (!uri) {
        return;
    }

    try {
        const file = new File(uri);
        if (file.exists) {
            file.delete();
        }
    } catch {
        // Temporary recordings may already have been removed by the OS.
    }
}
