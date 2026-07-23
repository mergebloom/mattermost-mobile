// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    RecordingPresets,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    useAudioPlayer,
    useAudioPlayerStatus,
    useAudioRecorder,
    useAudioRecorderState,
} from 'expo-audio';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, Platform, Pressable, StyleSheet, Text, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {changeOpacity} from '@utils/theme';
import {formatVoiceMessageDuration, MAX_VOICE_MESSAGE_DURATION_MS, removeVoiceRecording, voiceRecordingToFileInfo} from '@utils/voice_message';

type Props = {
    channelId: string;
    rootId: string;
    addFiles: (files: FileInfo[]) => void;
    sendMessage: (clientId: string) => Promise<void> | void;
};

type VoiceState = 'idle' | 'recording' | 'preview';

const VoiceMessage = ({channelId, rootId, addFiles, sendMessage}: Props) => {
    const theme = useTheme();
    const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const recorderState = useAudioRecorderState(recorder, 250);
    const [state, setState] = useState<VoiceState>('idle');
    const [recordingUri, setRecordingUri] = useState<string>();
    const [error, setError] = useState<string>();
    const player = useAudioPlayer(recordingUri || null);
    const playerStatus = useAudioPlayerStatus(player);
    const stopping = useRef(false);
    const stateRef = useRef<VoiceState>('idle');
    const uriRef = useRef<string | undefined>(undefined);
    const handedOff = useRef(false);

    useEffect(() => {
        stateRef.current = state;
    }, [state]);
    useEffect(() => {
        uriRef.current = recordingUri;
    }, [recordingUri]);

    const stopRecording = useCallback(async (discard = false) => {
        if (stopping.current || stateRef.current !== 'recording') {
            return;
        }
        stopping.current = true;
        try {
            await recorder.stop();
            const uri = recorder.uri;
            if (discard || !uri) {
                removeVoiceRecording(uri);
                setRecordingUri(undefined);
                setState('idle');
            } else {
                setRecordingUri(uri);
                setState('preview');
            }
        } catch {
            removeVoiceRecording(recorder.uri);
            setError('Voice recording could not be completed.');
            setState('idle');
        } finally {
            stopping.current = false;
            await setAudioModeAsync({allowsRecording: false});
        }
    }, [recorder]);

    const startRecording = useCallback(async () => {
        setError(undefined);
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
            setError('Microphone access is required to record a voice message.');
            return;
        }
        try {
            await setAudioModeAsync({allowsRecording: true, playsInSilentMode: true});
            await recorder.prepareToRecordAsync();
            recorder.record({forDuration: MAX_VOICE_MESSAGE_DURATION_MS / 1000});
            handedOff.current = false;
            stateRef.current = 'recording';
            setState('recording');
        } catch {
            setError('Voice recording could not be started.');
            await setAudioModeAsync({allowsRecording: false});
        }
    }, [recorder]);

    const cancel = useCallback(async () => {
        if (stateRef.current === 'recording') {
            await stopRecording(true);
            return;
        }
        player.pause();
        removeVoiceRecording(uriRef.current);
        uriRef.current = undefined;
        setRecordingUri(undefined);
        setState('idle');
    }, [player, stopRecording]);

    const send = useCallback(async () => {
        if (!recordingUri) {
            return;
        }
        try {
            const file = voiceRecordingToFileInfo(recordingUri);
            handedOff.current = true;
            addFiles([file]);
            setState('idle');
            setRecordingUri(undefined);
            await sendMessage(file.clientId!);
        } catch {
            handedOff.current = false;
            setError('Voice message could not be attached.');
        }
    }, [addFiles, recordingUri, sendMessage]);

    useEffect(() => {
        if (state === 'recording' && recorderState.durationMillis >= MAX_VOICE_MESSAGE_DURATION_MS) {
            stopRecording();
        }
    }, [recorderState.durationMillis, state, stopRecording]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState) => {
            if (nextState !== 'active' && stateRef.current === 'recording') {
                stopRecording();
            }
        });
        return () => subscription.remove();
    }, [stopRecording]);

    useEffect(() => () => {
        if (stateRef.current === 'recording') {
            stopRecording(true);
        } else if (!handedOff.current) {
            removeVoiceRecording(uriRef.current);
        }
    }, [channelId, rootId, stopRecording]);

    if (Platform.OS !== 'android') {
        return null;
    }

    const color = theme.centerChannelColor;
    const actionStyle = [styles.action, {backgroundColor: changeOpacity(color, 0.08)}];

    if (state === 'recording') {
        return (
            <View
                testID='voice-message.recording'
                style={styles.strip}
            >
                <View style={styles.status}>
                    <View style={[styles.dot, {backgroundColor: theme.dndIndicator}]}/>
                    <Text style={[styles.time, {color}]}>{formatVoiceMessageDuration(recorderState.durationMillis)}</Text>
                </View>
                <Pressable
                    accessibilityLabel='Cancel voice recording'
                    onPress={cancel}
                    style={actionStyle}
                    testID='voice-message.cancel'
                >
                    <CompassIcon
                        name='close'
                        size={22}
                        color={color}
                    />
                </Pressable>
                <Pressable
                    accessibilityLabel='Stop voice recording'
                    onPress={() => stopRecording()}
                    style={actionStyle}
                    testID='voice-message.stop'
                >
                    <CompassIcon
                        name='stop'
                        size={22}
                        color={theme.buttonBg}
                    />
                </Pressable>
            </View>
        );
    }

    if (state === 'preview') {
        return (
            <View
                testID='voice-message.preview'
                style={styles.strip}
            >
                <Pressable
                    accessibilityLabel={playerStatus.playing ? 'Pause voice message' : 'Play voice message'}
                    onPress={() => (playerStatus.playing ? player.pause() : player.play())}
                    style={actionStyle}
                    testID='voice-message.play'
                >
                    <CompassIcon
                        name={playerStatus.playing ? 'pause' : 'play'}
                        size={22}
                        color={color}
                    />
                </Pressable>
                <Text style={[styles.previewLabel, {color}]}>
                    {'Voice message · '}{formatVoiceMessageDuration(recorderState.durationMillis)}
                </Text>
                <Pressable
                    accessibilityLabel='Delete voice message'
                    onPress={cancel}
                    style={actionStyle}
                    testID='voice-message.delete'
                >
                    <CompassIcon
                        name='delete-outline'
                        size={22}
                        color={theme.dndIndicator}
                    />
                </Pressable>
                <Pressable
                    accessibilityLabel='Send voice message'
                    onPress={send}
                    style={[styles.action, {backgroundColor: theme.buttonBg}]}
                    testID='voice-message.send'
                >
                    <CompassIcon
                        name='send'
                        size={20}
                        color={theme.buttonColor}
                    />
                </Pressable>
            </View>
        );
    }

    return (
        <View>
            {error && (
                <Text
                    accessibilityRole='alert'
                    style={[styles.error, {color: theme.dndIndicator}]}
                >
                    {error}
                </Text>
            )}
            <Pressable
                accessibilityLabel='Record voice message'
                onPress={startRecording}
                style={actionStyle}
                testID='voice-message.record'
            >
                <CompassIcon
                    name='microphone-outline'
                    size={22}
                    color={color}
                />
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    action: {alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', marginHorizontal: 4, width: 40},
    dot: {borderRadius: 4, height: 8, marginRight: 8, width: 8},
    error: {fontSize: 12, paddingHorizontal: 8, paddingVertical: 4},
    previewLabel: {flex: 1, fontSize: 14, marginHorizontal: 8},
    status: {alignItems: 'center', flex: 1, flexDirection: 'row', paddingHorizontal: 12},
    strip: {alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: 48},
    time: {fontSize: 16, fontVariant: ['tabular-nums']},
});

export default VoiceMessage;
