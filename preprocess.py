import pandas as pd
import os
import json

class MusicHistory:
    def __init__(self, base_dir):
        self.base_dir = base_dir
        self.streaming_history = self.read_streaming_history()
        # self.library = self.read_library()
        # self.wrapped_2025 = self.read_wrapped_2025()


    def read_streaming_history(self):
        file_paths = [
            os.path.join(self.base_dir, file) 
            for file in os.listdir(self.base_dir)
            if file.startswith("StreamingHistory_music")
        ]
        dfs = []
        for file_path in file_paths:
            print(f"Reading streaming history: {file_path}")
            with open(file_path, 'r', encoding='utf-8') as file:
                data = json.load(file)

            dfs.append(pd.DataFrame(data))

        df = pd.concat(dfs)
        df['endTime_dt'] = pd.to_datetime(df['endTime'])
        return df


if __name__ == "__main__":
    base_dir = 'data/my_spotify_data/Spotify Account Data'
    music = MusicHistory(base_dir=base_dir)
    print(len(music.streaming_history))
    print(music.streaming_history.columns)
    


