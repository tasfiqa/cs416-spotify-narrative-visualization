import pandas as pd
import os
import json
from datetime import datetime
import calendar


class MusicHistory:
    def __init__(self, base_dir):
        self.base_dir = base_dir
        self.write_dir = "data/preprocessed_data"
        self.streaming_history = self.read_streaming_history()

    def read_json_file(self, file_name):
        file_path = os.path.join(self.base_dir, file_name)
        print(f"Reading {file_name}..")
        with open(file_path, "r", encoding="utf-8") as file:
            data = json.load(file)
        return data

    def read_wrapped(self):
        file_name = "Wrapped2025.json"
        return self.read_json_file(file_name)

    def read_sound_capsule(self):
        capsule = self.read_json_file("YourSoundCapsule.json")
        return capsule["stats"], capsule["highlights"]

    def read_taste_profile(self):
        return self.read_json_file("TasteProfile.json")["tasteProfile"]

    def read_library(self):
        library = self.read_json_file("YourLibrary.json")
        library_df = pd.DataFrame(library["tracks"])
        return pd.merge(
            library_df,
            self.streaming_history,
            how="left",
            left_on=["artist", "track"],
            right_on=["artistName", "trackName"],
        ).drop(columns=["artistName", "trackName"])

    def read_streaming_history(self):
        file_names = [
            file
            for file in os.listdir(self.base_dir)
            if file.startswith("StreamingHistory_music")
        ]
        dfs = []
        for file_name in file_names:
            data = self.read_json_file(file_name)
            dfs.append(pd.DataFrame(data))

        df = pd.concat(dfs)

        # preprocessing
        df["minutesPlayed"] = df["msPlayed"] / 60000
        df["endTime_dt"] = pd.to_datetime(df["endTime"])
        df["month"] = df["endTime_dt"].dt.month
        df["month_name"] = df["month"].map(lambda m: calendar.month_name[m])
        df["year"] = df["endTime_dt"].dt.year
        return df

    def filter_history_by_date(self, date: str):
        """
        date in YYYY-MM-DD format, e.g. 2025-07-11
        """
        date_dt = datetime.fromisoformat(date)
        return self.streaming_history[self.streaming_history["endTime_dt"] < date_dt]

    def filter_month(self, month: int, year: int):
        return self.streaming_history[
            (self.streaming_history["month"] == month)
            & (self.streaming_history["year"] == year)
        ]

    def filter_artist_by_month(self, month: int, year: int):
        """
        get artist msPlayed, filtered by month and year
        """
        month_df = self.filter_month(month, year)
        grouped_df = (
            month_df.groupby(["artistName"], as_index=False)
            .agg(
                minutesPlayed=("minutesPlayed", "sum"),
                msPlayed=("msPlayed", "sum"),
                tracks=("trackName", set),
                month=("month", "first"),
                year=("year", "first"),
            )
            .sort_values(by="minutesPlayed", ascending=False)
            .reset_index(drop=True)
        )
        return grouped_df

    def filter_tracks_by_month(self, month: int, year: int):
        month_df = self.filter_month(month, year)
        grouped_df = (
            month_df.groupby(["trackName", "artistName"], as_index=False)
            .agg(
                minutesPlayed=("minutesPlayed", "sum"),
                msPlayed=("msPlayed", "sum"),
                month=("month", "first"),
                year=("year", "first"),
            )
            .sort_values(by="minutesPlayed", ascending=False)
            .reset_index(drop=True)
        )
        return grouped_df

    def write_storylines(self):
        month_year = [
            (2025, 7),
            (2025, 8),
            (2025, 9),
            (2025, 10),
            (2025, 11),
            (2025, 12),
            (2026, 1),
            (2026, 2),
            (2026, 3),
            (2026, 4),
            (2026, 5),
            (2026, 6),
            (2026, 7),
        ]
        storylines = [
            "The year kicks off with Andrew Bird as your first-ever leader.",
            "Queens of the Stone Age takes over — a new leader for a second straight month.",
            "Silversun Pickups leads for the first time. Three months in, you've had three different favorites.",
            "System Of A Down debuts at the top.",
            "System Of A Down leads again — the first artist all year to repeat, breaking your 4-month streak of new favorites.",
            "Sufjan Stevens takes over to close out 2025. System Of A Down's run ends at two months.",
            "The Antlers open the new year as a fresh leader.",
            "Silver Mt. Zion leads for the first time — a one-month detour.",
            "The Rolling Stones take the top spot, your eighth different leader in nine months.",
            "The Antlers return to the top three months after their debut — their second time leading.",
            "The Antlers lead for a second straight month, now their longest run yet.",
            "The Antlers extend to a third consecutive month on top — the longest streak of your year.",
            "Carissa's Wierd closes out the year as a new favorite, but The Antlers finish as your most dominant artist overall, having led four months total.",
        ]

        storylines_json = {
            f"{year}-{month}": storyline
            for (year, month), storyline in zip(month_year, storylines)
        }

        storylines_fp = os.path.join(self.write_dir, "storylines.json")
        with open(storylines_fp, "w") as f:
            json.dump(storylines_json, f, indent=4)


    def write_filtered_data(self, month: int, year: int):
        artists = self.filter_artist_by_month(month, year)
        if len(artists) > 0:
            artists_fp = f"artists_{month}_{year}.csv"
            print(f"Writing {artists_fp}")
            artists.to_csv(f"data/preprocessed_data/{artists_fp}", index=False)
        else:
            print(f"Skipping {month}-{year}")
            return

        tracks = self.filter_tracks_by_month(month, year)
        tracks_fp = f"tracks_{month}_{year}.csv"
        print(f"Writing {tracks_fp}")
        tracks.to_csv(f"data/preprocessed_data/{tracks_fp}", index=False)


if __name__ == "__main__":
    base_dir = "data/my_spotify_data/Spotify Account Data"
    music = MusicHistory(base_dir=base_dir)
    history = music.streaming_history
    years = [2025, 2026]
    months = history["month"].unique()
    # for year in years:
    #     for month in months:
    #         music.write_filtered_data(month, year)
    music.write_storylines()
