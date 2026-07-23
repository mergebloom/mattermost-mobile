// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, fireEvent, render} from '@testing-library/react-native';
import React from 'react';
import {AppState, type AppStateStatus, Platform} from 'react-native';

import VoiceMessage from './voice_message';

const mockRecorder = {
    prepareToRecordAsync: jest.fn(),
    record: jest.fn(),
    stop: jest.fn(),
    uri: 'file:///cache/voice.m4a',
};
const mockPlayer = {play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(), playing: false};
const mockRequestPermission = jest.fn();
const mockSetAudioMode = jest.fn();
let appStateListener: ((state: AppStateStatus) => void) | undefined;

jest.mock('expo-audio', () => ({
    RecordingPresets: {HIGH_QUALITY: {extension: '.m4a'}},
    requestRecordingPermissionsAsync: () => mockRequestPermission(),
    setAudioModeAsync: (mode: unknown) => mockSetAudioMode(mode),
    useAudioPlayer: () => mockPlayer,
    useAudioPlayerStatus: () => ({playing: mockPlayer.playing, didJustFinish: false}),
    useAudioRecorder: () => mockRecorder,
    useAudioRecorderState: () => ({durationMillis: 1200}),
}));

jest.mock('@utils/voice_message', () => ({
    formatVoiceMessageDuration: () => '0:01',
    removeVoiceRecording: jest.fn(),
    voiceRecordingToFileInfo: () => ({clientId: 'voice-id', localPath: mockRecorder.uri}),
}));

const renderVoiceMessage = () => render(
    <VoiceMessage
        channelId='channel'
        rootId=''
        addFiles={jest.fn()}
        sendMessage={jest.fn()}
    />,
);

describe('VoiceMessage', () => {
    const addFiles = jest.fn();
    const sendMessage = jest.fn().mockResolvedValue(undefined);

    beforeEach(() => {
        jest.clearAllMocks();
        mockRequestPermission.mockResolvedValue({granted: true, canAskAgain: true});
        Object.defineProperty(Platform, 'OS', {configurable: true, value: 'android'});
        jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
            appStateListener = listener;
            return {remove: jest.fn()};
        });
    });

    it('records, previews, and sends through addFiles and the normal send pipeline', async () => {
        const screen = render(
            <VoiceMessage
                channelId='channel'
                rootId=''
                addFiles={addFiles}
                sendMessage={sendMessage}
            />,
        );
        await act(async () => fireEvent.press(screen.getByTestId('voice-message.record')));
        expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalled();
        expect(mockRecorder.record).toHaveBeenCalled();
        expect(screen.getByTestId('voice-message.recording')).toBeVisible();

        await act(async () => fireEvent.press(screen.getByTestId('voice-message.stop')));
        expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('voice-message.preview')).toBeVisible();

        await act(async () => fireEvent.press(screen.getByTestId('voice-message.send')));
        expect(addFiles).toHaveBeenCalledWith([expect.objectContaining({clientId: 'voice-id'})]);
        expect(sendMessage).toHaveBeenCalledTimes(1);
    });

    it('shows a denial state without starting the recorder', async () => {
        mockRequestPermission.mockResolvedValueOnce({granted: false, canAskAgain: false});
        const screen = renderVoiceMessage();
        await act(async () => fireEvent.press(screen.getByTestId('voice-message.record')));
        expect(mockRecorder.record).not.toHaveBeenCalled();
        expect(screen.getByText('Microphone access is required to record a voice message.')).toBeVisible();
    });

    it('stops only once when interrupted', async () => {
        const screen = renderVoiceMessage();
        await act(async () => fireEvent.press(screen.getByTestId('voice-message.record')));
        await act(async () => appStateListener?.('background'));
        await act(async () => appStateListener?.('background'));
        expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    });

    it('is Android-only', () => {
        Object.defineProperty(Platform, 'OS', {configurable: true, value: 'ios'});
        const screen = renderVoiceMessage();
        expect(screen.queryByTestId('voice-message.record')).toBeNull();
    });
});
