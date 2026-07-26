import pandas as pd
import os
import json
from datetime import datetime
import calendar

class MusicHistory:
    def __init__(self, base_dir):
        self.base_dir = base_dir
        self.streaming_history = self.read_streaming_history()
        self.taste_profile = self.read_taste_profile()
        self.library = self.read_library()
        self.stats, self.highlights = self.read_sound_capsule()
        # self.wrapped_2025 = self.read_wrapped()

    def read_json_file(self, file_name):
        file_path = os.path.join(self.base_dir, file_name)
        print(f"Reading {file_name}..")
        with open(file_path, 'r', encoding='utf-8') as file:
            data = json.load(file)
        return data

    def read_wrapped(self):
        file_name = "Wrapped2025.json"
        return self.read_json_file(file_name)

    def read_sound_capsule(self):
        capsule = self.read_json_file("YourSoundCapsule.json")
        return capsule['stats'], capsule['highlights']

    def read_taste_profile(self):
        return self.read_json_file("TasteProfile.json")['tasteProfile']

    def read_library(self):
        library = self.read_json_file("YourLibrary.json")
        library_df = pd.DataFrame(library['tracks'])
        return pd.merge(
            library_df, 
            self.streaming_history,
            how='left',
            left_on=['artist', 'track'],
            right_on=['artistName', 'trackName']
        ).drop(columns=['artistName', 'trackName'])


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
        df['minutesPlayed'] = df['msPlayed'] / 60000
        df['endTime_dt'] = pd.to_datetime(df['endTime'])
        df['month'] = df['endTime_dt'].dt.month
        df['month_name'] = df['month'].map(lambda m: calendar.month_name[m])
        df['year'] = df['endTime_dt'].dt.year
        return df


    def filter_history_by_date(self, date: str):
        """
        date in YYYY-MM-DD format, e.g. 2025-07-11
        """
        date_dt = datetime.fromisoformat(date)
        return self.streaming_history[self.streaming_history['endTime_dt'] < date_dt]
    
    def filter_month(self, month: int, year: int):
        return (
            self.streaming_history[
                (self.streaming_history['month'] == month)
                & (self.streaming_history['year'] == year)
            ]
        )
    
    
    def filter_artist_by_month(self, month: int, year: int):
        """
        get artist msPlayed, filtered by month and year
        """
        month_df = self.filter_month(month, year)
        grouped_df = month_df.groupby(['artistName'], as_index=False).agg(
            minutesPlayed=('minutesPlayed', 'sum'),
            msPlayed=('msPlayed', 'sum'),
            tracks=('trackName', set),
            month=('month', 'first'),
            year=('year', 'first'),
        ).sort_values(by='minutesPlayed', ascending=False).reset_index(drop=True)
        return grouped_df
    

    def filter_tracks_by_month(self, month: int, year: int):
        month_df = self.filter_month(month, year)
        grouped_df = month_df.groupby(['trackName', 'artistName'], as_index=False).agg(
            minutesPlayed=('minutesPlayed', 'sum'),
            msPlayed=('msPlayed', 'sum'),
            month=('month', 'first'),
            year=('year', 'first'),
        ).sort_values(by='minutesPlayed', ascending=False).reset_index(drop=True)
        return grouped_df
    
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
    base_dir = 'data/my_spotify_data/Spotify Account Data'
    music = MusicHistory(base_dir=base_dir)
    history = music.streaming_history
    years = [2025, 2026]
    months = history['month'].unique()
    for year in years:
        for month in months:
            music.write_filtered_data(month, year)

    


