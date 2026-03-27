import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase";

export default function LoginScreen() {
  const [login, setLogin] = useState("");
  const [pin, setPin] = useState("");
  const [errorMsg, setErrorMsg] = useState(""); // STAN DLA BŁĘDÓW NA EKRANIE
  const router = useRouter();

  const handleLogin = async () => {
    // Czyścimy błąd na start
    setErrorMsg("");

    if (!login || !pin) {
      setErrorMsg("Proszę podać login i PIN.");
      return;
    }

    try {
      const { data, error } = await supabase.rpc("autoryzuj_pracownika", {
        p_login: login.toLowerCase().trim(), // Zawsze małe litery, usuwamy spacje
        p_pin: pin.trim(),
      });

      if (error) {
        setErrorMsg("Błąd serwera: " + error.message);
      } else if (data && data.length > 0) {
        const user = data[0];

        // BRAMKARZ: Segregacja po rolach
        if (user.rola === "admin" || user.rola === "kierownik") {
          router.replace({
            pathname: "/admin", // Zmień na swój plik panelu admina
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else if (user.rola === "dyrektor") {
          router.replace({
            pathname: "/panel-dyrektor",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else if (user.rola === "szef") {
          router.replace({
            pathname: "/panel-szef",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else if (user.rola === "kierownik_produkcji") {
          router.replace({
            pathname: "/kierownik-panel",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else if (user.rola === "biuro") {
          router.replace({
            pathname: "/panel-biuro",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else if (user.rola === "ubieralnia") {
          router.replace({
            pathname: "/hala-ubieralnia",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else if (user.rola === "pikowanie") {
          router.replace({
            pathname: "/hala-pikowanie",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else if (user.rola === "magazyn") {
          router.replace({
            pathname: "/magazyn-wysylka",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else if (user.rola === "krojcza_kierownik_szwalni") {
          router.replace({
            pathname: "/hala-krojownia",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        } else {
          // Krawcowe / Szwaczki itp. idą na szwalnię
          router.replace({
            pathname: "/hala-szwalnia",
            params: {
              idPracownika: user.id,
              nazwaPracownika: user.nazwa_wyswietlana,
            },
          });
        }
      } else {
        // ZWRACA PUSTE DANE = BŁĘDNY LOGIN LUB HASŁO
        setErrorMsg("Nieprawidłowy login lub PIN.");
      }
    } catch (err) {
      setErrorMsg("Problem z połączeniem z bazą danych.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.backgroundShape} />
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.logoText}>PASCALL</Text>
          <Text style={styles.subtitleText}>System Produkcyjny</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>ID Pracownika / Login</Text>
          <TextInput
            style={styles.input}
            placeholder="np. krawcowa01"
            placeholderTextColor="#9ca3af"
            value={login}
            onChangeText={(text) => {
              setLogin(text);
              setErrorMsg(""); // Czyści błąd jak zaczniesz pisać
            }}
            autoCapitalize="none"
            onSubmitEditing={handleLogin}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Kod PIN</Text>
          <TextInput
            style={styles.input}
            placeholder="••••"
            placeholderTextColor="#9ca3af"
            secureTextEntry={true}
            keyboardType="numeric"
            value={pin}
            onChangeText={(text) => {
              setPin(text);
              setErrorMsg(""); // Czyści błąd jak zaczniesz pisać
            }}
            onSubmitEditing={handleLogin}
          />
        </View>

        {/* POJEMNIK NA BŁĘDY - WIDOCZNY TYLKO JAK JEST BŁĄD */}
        {errorMsg ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.8}
          onPress={handleLogin}
        >
          <Text style={styles.buttonText}>ZALOGUJ SIĘ</Text>
        </TouchableOpacity>
        <Text style={styles.footerText}>© 2026 Pascall</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#eef2f6",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  backgroundShape: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "40%",
    backgroundColor: "#0f172a",
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  header: { alignItems: "center", marginBottom: 30 },
  logoText: {
    fontSize: 32,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 2,
  },
  subtitleText: {
    fontSize: 14,
    color: "#64748b",
    fontWeight: "500",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  inputGroup: { marginBottom: 20 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#0f172a",
  },

  // NOWE STYLE DLA BŁĘDÓW
  errorContainer: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#f87171",
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    alignItems: "center",
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    fontWeight: "bold",
  },

  button: {
    backgroundColor: "#0ea5e9",
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    marginTop: 5,
    shadowColor: "#0ea5e9",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  footerText: {
    textAlign: "center",
    marginTop: 24,
    fontSize: 12,
    color: "#94a3b8",
  },
});
