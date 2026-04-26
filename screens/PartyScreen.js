import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function PartyScreen({ route, navigation }) {
  const { partyCode } = route.params;

  return (
    <View style={styles.container}>
      {/* ── Top accent bar ── */}
      <View style={styles.accentBar} />

      {/* ── Invite section ── */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>SHARE THIS CODE</Text>

        {/* Code display — each character in its own cell */}
        <View style={styles.codeRow}>
          {partyCode.split('').map((char, i) => (
            <View key={i} style={styles.codeCell}>
              <Text style={styles.codeChar}>{char}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.hint}>
          Friends can join by entering this code on the Home screen
        </Text>
      </View>

      {/* ── Divider ── */}
      <View style={styles.divider} />

      {/* ── CTA ── */}
      <TouchableOpacity
        style={styles.buttonPrimary}
        onPress={() => navigation.navigate('Map', { partyCode })}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonTextPrimary}>🗺  Open Map</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
      >
        <Text style={styles.backText}>← Back to Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d0d0f',
    paddingHorizontal: 32,
  },

  /* ── Top accent ── */
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#FF6B00',
  },

  /* ── Code card ── */
  card: {
    width: '100%',
    backgroundColor: '#141416',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,107,0,0.20)',
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 32,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF6B00',
    letterSpacing: 5,
    marginBottom: 24,
  },
  codeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  codeCell: {
    width: 48,
    height: 60,
    backgroundColor: '#1c1c1f',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,107,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeChar: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FF6B00',
    letterSpacing: 0,
  },
  hint: {
    fontSize: 13,
    color: '#9B9BA8',
    textAlign: 'center',
    lineHeight: 19,
  },

  /* ── Divider ── */
  divider: {
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#1c1c1f',
    marginBottom: 32,
  },

  /* ── Buttons ── */
  buttonPrimary: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 50,
    backgroundColor: '#00D4AA',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#00D4AA',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.40,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonTextPrimary: {
    color: '#0d0d0f',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  backText: {
    color: '#9B9BA8',
    fontSize: 15,
    fontWeight: '600',
  },
});