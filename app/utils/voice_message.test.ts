// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {formatVoiceMessageDuration, voiceRecordingToFileInfo} from './voice_message';

jest.mock('expo-file-system', () => ({
    File: jest.fn().mockImplementation(() => ({info: () => ({exists: true, size: 1234})})),
}));

jest.mock('@utils/general', () => ({generateId: () => 'voice-client-id'}));

describe('voice message utilities', () => {
    it('formats elapsed recording time', () => {
        expect(formatVoiceMessageDuration(0)).toBe('0:00');
        expect(formatVoiceMessageDuration(65_999)).toBe('1:05');
    });

    it('converts an M4A recording into the existing upload FileInfo shape', () => {
        expect(voiceRecordingToFileInfo('file:///cache/recording.m4a', 1710000000000)).toEqual(expect.objectContaining({
            clientId: 'voice-client-id',
            extension: 'm4a',
            has_preview_image: false,
            height: 0,
            localPath: 'file:///cache/recording.m4a',
            mime_type: 'audio/mp4',
            name: 'voice-message-1710000000000.m4a',
            size: 1234,
            user_id: '',
            width: 0,
        }));
    });

    it('rejects a missing recording', () => {
        jest.requireMock('expo-file-system').File.mockImplementationOnce(() => ({info: () => ({exists: false})}));
        expect(() => voiceRecordingToFileInfo('file:///missing.m4a')).toThrow('Voice recording file is unavailable');
    });
});
