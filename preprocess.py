import pandas as pd
import os
import json

class MusicHistory:
    def __init__(self, base_dir):
        self.base_dir = base_dir
        self.streaming_history = self.read_streaming_history()
        self.taste_profile = self.read_taste_profile()
        self.library = self.read_library()
        self.stats, self.highlights = self.read_sound_capsule()
        # self.wrapped_2025 = self.read_wrapped_2025()

    def read_json_file(self, file_name):
        file_path = os.path.join(self.base_dir, file_name)
        print(f"Reading {file_name}..")
        with open(file_path, 'r', encoding='utf-8') as file:
            data = json.load(file)
        return data

    def read_sound_capsule(self):
        capsule = self.read_json_file("YourSoundCapsule.json")
        print(capsule.keys())
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
        df['endTime_dt'] = pd.to_datetime(df['endTime'])
        return df


if __name__ == "__main__":
    base_dir = 'data/my_spotify_data/Spotify Account Data'
    music = MusicHistory(base_dir=base_dir)
    


