import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import CzatWidget from "../components/CzatWidget";
import { supabase } from "../supabase";

export default function BiuroListaZlecenScreen() {
  const router = useRouter();
  const { idPracownika, nazwaPracownika } = useLocalSearchParams();
  const bezpieczneId = Array.isArray(idPracownika)
    ? idPracownika[0]
    : idPracownika;

  const [isMounted, setIsMounted] = useState(false);
  const [zlecenia, setZlecenia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Zmienna przechowująca tekst z wyszukiwarki
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    fetchZlecenia();

    // Podpinamy nasłuch na żywo dla Biura
    const subskrypcja = supabase
      .channel("zmiany_biuro")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "zlecenia" },
        () => {
          fetchZlecenia(true);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subskrypcja);
    };
  }, [isMounted]);

  const fetchZlecenia = async (ciche = false) => {
    if (!ciche) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("zlecenia")
        .select("*")
        .order("utworzono", { ascending: false });

      if (error) console.error("Błąd pobierania:", error);
      else if (data) setZlecenia(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!ciche) setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "nowe":
      case "oczekuje_kierownik":
      case "oczekuje_krojownia":
        return "#3b82f6"; // Niebieski (Początkowe)
      case "krojenie_w_trakcie":
      case "pikowanie_w_trakcie":
      case "ubieranie_w_trakcie":
        return "#f59e0b"; // Pomarańczowy (W trakcie produkcji)
      case "gotowe_do_szycia":
        return "#8b5cf6"; // Fioletowy
      case "szycie_w_trakcie":
        return "#ec4899"; // Różowy/Magenta
      case "do_kontroli":
        return "#eab308"; // Żółty
      case "do_poprawki":
        return "#ef4444"; // Czerwony
      case "zrealizowane":
      case "do_wysylki":
        return "#10b981"; // Zielony
      case "anulowane":
        return "#1e293b"; // Ciemny / Czarny (Anulowane)
      default:
        return "#64748b"; // Szary
    }
  };

  // Tłumacz tekst statusu
  const formatStatusText = (status: string) => {
    if (!status) return "NIEZNANY";
    return status.replace(/_/g, " ").toUpperCase();
  };

  // --- LOGIKA USUWANIA LUB ANULOWANIA ZLECENIA ---
  const handleDeleteOrCancel = (item: any) => {
    const isNew = ["nowe", "oczekuje_kierownik", "oczekuje_krojownia"].includes(
      item.status,
    );
    const actionType = isNew ? "USUNIĘCIE ZLECENIA" : "ANULOWANIE ZLECENIA";
    const message = isNew
      ? `To zlecenie nie trafiło jeszcze na produkcję.\nCzy na pewno chcesz je TRWALE USUNĄĆ?`
      : `UWAGA! Zlecenie ${item.numer_zd} jest już w trakcie produkcji (Status: ${formatStatusText(item.status)}).\n\nNie można go trwale usunąć. Zostanie przerwane i ANULOWANE.\nCzy potwierdzasz?`;

    const performAction = async () => {
      setLoading(true);
      try {
        if (isNew) {
          // Trwałe usunięcie (Manualny kaskadowy delete dla pewności)
          await supabase
            .from("pozycje_zlecenia")
            .delete()
            .eq("id_zlecenia", item.id);
          await supabase
            .from("historia_statusow")
            .delete()
            .eq("id_zlecenia", item.id);
          await supabase.from("logi_pracy").delete().eq("id_zlecenia", item.id);
          const { error } = await supabase
            .from("zlecenia")
            .delete()
            .eq("id", item.id);

          if (error) throw error;

          if (Platform.OS === "web")
            window.alert(
              `Zlecenie ${item.numer_zd} zostało całkowicie usunięte z bazy.`,
            );
          else
            Alert.alert(
              "Usunięto",
              `Zlecenie ${item.numer_zd} zostało usunięte.`,
            );
        } else {
          // Zatrzymanie / Anulowanie w trakcie
          const { error } = await supabase
            .from("zlecenia")
            .update({ status: "anulowane" })
            .eq("id", item.id);
          if (error) throw error;

          if (bezpieczneId) {
            await supabase.from("historia_statusow").insert([
              {
                id_zlecenia: item.id,
                id_pracownika: bezpieczneId,
                id_firmy: item.id_firmy,
                stary_status: item.status,
                nowy_status: "anulowane",
              },
            ]);
          }

          if (Platform.OS === "web")
            window.alert(
              `Zlecenie ${item.numer_zd} zostało pomyślnie ANULOWANE.`,
            );
          else
            Alert.alert(
              "Anulowano",
              `Produkcja ZD ${item.numer_zd} została zatrzymana.`,
            );
        }
        fetchZlecenia(true);
      } catch (err: any) {
        Alert.alert("Błąd", err.message || "Nie udało się wykonać akcji.");
      } finally {
        setLoading(false);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(`${actionType}\n\n${message}`)) {
        performAction();
      }
    } else {
      Alert.alert(actionType, message, [
        { text: "Wróć", style: "cancel" },
        {
          text: isNew ? "Tak, usuń trwale" : "Tak, zatrzymaj (Anuluj)",
          style: "destructive",
          onPress: performAction,
        },
      ]);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const dataDodania = new Date(item.utworzono).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const isCanceled = item.status === "anulowane";

    return (
      <TouchableOpacity
        style={[styles.zlecenieCard, isCanceled && { opacity: 0.6 }]}
        onPress={() =>
          router.push({
            pathname: "/biuro-zlecenie-detale",
            params: { id: item.id },
          })
        }
      >
        <View style={styles.zlecenieHeader}>
          <Text
            style={[
              styles.numerZD,
              isCanceled && {
                textDecorationLine: "line-through",
                color: "#64748b",
              },
            ]}
          >
            {item.numer_zd}
          </Text>

          <View style={styles.actionIconsRow}>
            {/* PRZYCISK EDYCJI */}
            {!isCanceled && (
              <TouchableOpacity
                style={styles.iconButton}
                onPress={(e) => {
                  e.stopPropagation(); // Blokuje przejście do detali zlecenia
                  // TODO: Jeśli chcesz dedykowany ekran edycji, zmień ścieżkę. Na razie kierujemy do detali.
                  router.push({
                    pathname: "/biuro-zlecenie-detale",
                    params: { id: item.id, trybEdycji: "tak" },
                  });
                }}
              >
                <Text style={styles.iconText}>✏️</Text>
              </TouchableOpacity>
            )}

            {/* PRZYCISK USUŃ / ANULUJ */}
            <TouchableOpacity
              style={styles.iconButton}
              onPress={(e) => {
                e.stopPropagation();
                handleDeleteOrCancel(item);
              }}
            >
              <Text style={styles.iconText}>🗑️</Text>
            </TouchableOpacity>

            <Text style={styles.chevronIcon}>›</Text>
          </View>
        </View>

        <View style={styles.zlecenieMeta}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.status) },
            ]}
          >
            <Text style={styles.statusText}>
              {formatStatusText(item.status)}
            </Text>
          </View>
          <Text style={styles.dataText}>{dataDodania}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredZlecenia = zlecenia.filter((zlecenie) =>
    zlecenie.numer_zd.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (!isMounted) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Podgląd Zleceń</Text>
        <Text style={styles.subtitle}>Lista zleceń na produkcji (Biuro)</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Szukaj numeru ZD..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color="#0f172a"
          style={{ marginTop: 50 }}
        />
      ) : (
        <FlatList
          data={filteredZlecenia}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          onRefresh={() => fetchZlecenia(false)}
          refreshing={loading}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchQuery
                ? "Nie znaleziono zlecenia o takim numerze."
                : "Brak zleceń w bazie."}
            </Text>
          }
        />
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace("/panel-biuro")}
        >
          <Text style={styles.buttonText}>WRÓĆ DO MENU</Text>
        </TouchableOpacity>
      </View>

      <CzatWidget
        idPracownika={idPracownika}
        nazwaPracownika={nazwaPracownika}
        rola={"biuro"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#eef2f6", paddingTop: 60 },
  header: { alignItems: "center", marginBottom: 15, paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: "900", color: "#0f172a", marginBottom: 5 },
  subtitle: { fontSize: 16, color: "#64748b" },

  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 15,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  searchInput: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    color: "#0f172a",
  },

  listContainer: { paddingHorizontal: 20, paddingBottom: 100 },
  zlecenieCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  zlecenieHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  numerZD: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0f172a",
    flex: 1,
    marginRight: 10,
  },
  actionIconsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    padding: 8,
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    marginRight: 10,
  },
  iconText: {
    fontSize: 16,
  },
  chevronIcon: { fontSize: 26, color: "#94a3b8", fontWeight: "bold" },

  zlecenieMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20 },
  statusText: { color: "#ffffff", fontSize: 11, fontWeight: "bold" },
  dataText: { fontSize: 12, color: "#64748b", fontWeight: "600" },
  emptyText: {
    textAlign: "center",
    color: "#64748b",
    marginTop: 50,
    fontSize: 16,
  },
  footer: { padding: 20, alignItems: "center", backgroundColor: "#eef2f6" },
  backButton: {
    backgroundColor: "#64748b",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    maxWidth: 300,
    alignItems: "center",
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
});
