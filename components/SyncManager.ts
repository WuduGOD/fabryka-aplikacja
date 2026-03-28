import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase";

const KOLEJKA_KLUCZ = "@kolejka_zadan_offline";

export const SyncManager = {
  dodajDoKolejki: async (
    tabela: string,
    typAkcji: "INSERT" | "UPDATE",
    dane: any,
    idRekorduDoUpdate?: any,
  ) => {
    try {
      const obecnaKolejka = await AsyncStorage.getItem(KOLEJKA_KLUCZ);
      let kolejka = obecnaKolejka ? JSON.parse(obecnaKolejka) : [];

      kolejka.push({
        idZadania: Date.now().toString(),
        tabela,
        typAkcji,
        dane,
        // TERAZ TO MOŻE BYĆ ID (tekst) LUB ZESTAW WARUNKÓW DO DOPASOWANIA (obiekt)
        idRekorduDoUpdate,
      });

      await AsyncStorage.setItem(KOLEJKA_KLUCZ, JSON.stringify(kolejka));
      console.log("Zapisano w trybie offline. W kolejce:", kolejka.length);
    } catch (error) {
      console.error("Błąd zapisu do schowka:", error);
    }
  },

  pobierzIloscWklejce: async () => {
    try {
      const obecnaKolejka = await AsyncStorage.getItem(KOLEJKA_KLUCZ);
      return obecnaKolejka ? JSON.parse(obecnaKolejka).length : 0;
    } catch (e) {
      return 0;
    }
  },

  wyslijZalegle: async () => {
    try {
      const obecnaKolejka = await AsyncStorage.getItem(KOLEJKA_KLUCZ);
      if (!obecnaKolejka) return 0;

      let kolejka = JSON.parse(obecnaKolejka);
      if (kolejka.length === 0) return 0;

      let wyslane = [];

      for (const zadanie of kolejka) {
        let error = null;

        if (zadanie.typAkcji === "INSERT") {
          const res = await supabase
            .from(zadanie.tabela)
            .insert([zadanie.dane]);
          error = res.error;
        } else if (zadanie.typAkcji === "UPDATE") {
          // MAGIA INTELIGENTNEGO KURIERA: Jeśli dostanie warunki (np. znajdź po id_zlecenia), zaktualizuje właściwy log!
          if (
            typeof zadanie.idRekorduDoUpdate === "object" &&
            zadanie.idRekorduDoUpdate !== null
          ) {
            const res = await supabase
              .from(zadanie.tabela)
              .update(zadanie.dane)
              .match(zadanie.idRekorduDoUpdate);
            error = res.error;
          } else {
            const res = await supabase
              .from(zadanie.tabela)
              .update(zadanie.dane)
              .eq("id", zadanie.idRekorduDoUpdate);
            error = res.error;
          }
        }

        if (!error) {
          wyslane.push(zadanie.idZadania);
        }
      }

      const nowaKolejka = kolejka.filter(
        (z: any) => !wyslane.includes(z.idZadania),
      );
      await AsyncStorage.setItem(KOLEJKA_KLUCZ, JSON.stringify(nowaKolejka));

      return wyslane.length;
    } catch (error) {
      console.error("Błąd synchronizacji zaległych:", error);
      return 0;
    }
  },
};
