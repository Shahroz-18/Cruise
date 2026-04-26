import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export default function HomeScreen({ navigation, route }) {
    const savedPartyCode = route.params?.savedPartyCode;

    const handleCreateParty = async () => {
        try {
            const db = getFirestore();
            const auth = getAuth();
            const uid = auth.currentUser.uid;
            const partyCode = generateCode();

            await setDoc(doc(db, 'parties', partyCode), {
                code: partyCode,
                creator: uid,
                leaderId: uid,
                members: [uid],
                createdAt: new Date(),
            });

            await AsyncStorage.setItem('currentPartyCode', partyCode);
            navigation.navigate('Party', { partyCode });
        } catch (error) {
            Alert.alert('Error', error.message);
        }
    };

    const handleRejoinParty = () => {
        navigation.navigate('Map', { partyCode: savedPartyCode });
    };

    return (
        <View style={styles.container}>
            {/* ── Decorative rings ── */}
            <View style={styles.ringOuter} />
            <View style={styles.ringInner} />

            {/* ── Content column: capped width so buttons don't stretch on web ── */}
            <View style={styles.content}>

                {/* ── Brand ── */}
                <View style={styles.brandWrapper}>
                    <Text style={styles.emoji}>🚴</Text>
                    <Text style={styles.title}>CRUISE</Text>
                    <Text style={styles.subtitle}>BIKE PARTY TRACKER</Text>
                </View>

                {/* ── Divider ── */}
                <View style={styles.divider} />

                {/* ── Primary actions ── */}
                <View style={styles.buttonGroup}>
                    <TouchableOpacity style={styles.buttonPrimary} onPress={handleCreateParty} activeOpacity={0.8}>
                        <Text style={styles.buttonTextPrimary}>＋  Create Party</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.buttonSecondary} onPress={() => navigation.navigate('JoinParty')} activeOpacity={0.8}>
                        <Text style={styles.buttonTextSecondary}>Join Party</Text>
                    </TouchableOpacity>

                    {/* Rejoin – only visible when a saved code exists */}
                    {savedPartyCode && (
                        <TouchableOpacity
                            style={styles.buttonRejoin}
                            onPress={handleRejoinParty}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.buttonTextSecondary}>🔁  Rejoin  •  {savedPartyCode}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* ── Profile link ── */}
                <TouchableOpacity
                    style={styles.profileLink}
                    onPress={() => navigation.navigate('Profile')}
                    activeOpacity={0.7}
                >
                    <Text style={styles.profileLinkText}>👤  Set Nickname</Text>
                </TouchableOpacity>

            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0d0d0f',
        overflow: 'hidden',
    },
    /* ── Centered content column — never wider than 420px ── */
    content: {
        width: '100%',
        maxWidth: 420,
        alignItems: 'center',
        paddingHorizontal: 32,
    },

    /* ── Decorative circles ── */
    ringOuter: {
        position: 'absolute',
        width: 420,
        height: 420,
        borderRadius: 210,
        borderWidth: 1,
        borderColor: 'rgba(255,107,0,0.10)',
        top: -80,
        right: -100,
    },
    ringInner: {
        position: 'absolute',
        width: 260,
        height: 260,
        borderRadius: 130,
        borderWidth: 1,
        borderColor: 'rgba(255,107,0,0.07)',
        top: -10,
        right: -30,
    },

    /* ── Brand ── */
    brandWrapper: {
        alignItems: 'center',
        marginBottom: 36,
    },
    emoji: {
        fontSize: 64,
        marginBottom: 8,
    },
    title: {
        fontSize: 52,
        fontWeight: '900',
        color: '#FFFFFF',
        letterSpacing: 10,
    },
    subtitle: {
        fontSize: 11,
        fontWeight: '700',
        color: '#FF6B00',
        letterSpacing: 5,
        marginTop: 6,
    },

    /* ── Divider ── */
    divider: {
        width: 48,
        height: 3,
        borderRadius: 2,
        backgroundColor: '#FF6B00',
        marginBottom: 40,
    },

    /* ── Button group ── */
    buttonGroup: {
        width: '100%',
        alignItems: 'stretch',
        gap: 14,
        marginBottom: 36,
    },
    buttonPrimary: {
        width: '100%',
        paddingVertical: 18,
        borderRadius: 50,
        backgroundColor: '#FF6B00',
        alignItems: 'center',
        shadowColor: '#FF6B00',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
        elevation: 8,
    },
    buttonTextPrimary: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '800',
        letterSpacing: 1,
    },
    buttonSecondary: {
        width: '100%',
        paddingVertical: 17,
        borderRadius: 50,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: 'rgba(255,107,0,0.55)',
        alignItems: 'center',
    },
    buttonRejoin: {
        width: '100%',
        paddingVertical: 17,
        borderRadius: 50,
        backgroundColor: 'rgba(0,212,170,0.10)',
        borderWidth: 1.5,
        borderColor: 'rgba(0,212,170,0.55)',
        alignItems: 'center',
    },
    buttonTextSecondary: {
        color: '#F0F0F2',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.5,
    },

    /* ── Profile link ── */
    profileLink: {
        paddingVertical: 10,
        paddingHorizontal: 24,
    },
    profileLinkText: {
        color: '#9B9BA8',
        fontSize: 15,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
});