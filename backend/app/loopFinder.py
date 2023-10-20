import numpy as np
import cv2
import imagehash
from PIL import Image
from datetime import timedelta, datetime
from moviepy.editor import VideoFileClip

class loopFinder:
    def __init__(self, clip, minLen, maxLen, threshold, eval):
        self.clip = clip
        self.frames = 30
        self.minLen = minLen
        self.maxLen = maxLen
        self.hashSize = 32
        self.bands = 32
        self.threshold = threshold
        self.eval = eval

    def format_timedelta(self, td):
        result = str(td)
        try:
            result, ms = result.split(".")
        except ValueError:
            return (result + ".00").replace(":", "-")
        ms = int(ms)
        ms = round(ms / 1e4)
        return f"{result}.{ms:02}".replace(":", "-")

    def is_valid(self, start_str, end_str):
        start_obj = datetime.strptime(start_str, '%H-%M-%S.%f')
        end_obj   = datetime.strptime(end_str, '%H-%M-%S.%f')
        td = end_obj - start_obj
        return td >= timedelta(seconds=self.minLen) and td <= timedelta(seconds=self.maxLen)

    def create_frames(self):
        clip = self.clip
        saving_frames_per_second = min(clip.fps, self.frames)
        step = 1 / clip.fps if saving_frames_per_second == 0 else 1 / saving_frames_per_second
        frames = dict()
        for current_duration in np.arange(0, clip.duration, step):
            frame_duration_formatted = self.format_timedelta(timedelta(seconds=current_duration))
            frame = clip.get_frame(current_duration)
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame = Image.fromarray(frame)
            frames[frame_duration_formatted] = frame
        return frames

    def calculate_signatures(self, frames):
        hashSize = self.hashSize
        signatures = dict()
        fd_to_idx = dict()
        frame_list = list()
        for i, (fd, frame) in enumerate(frames.items()):
            f = frame.convert("L").resize((hashSize+1,hashSize),Image.ANTIALIAS)
            dhash = imagehash.dhash(f,hashSize)
            signature = dhash.hash.flatten()
            signatures[fd] = np.packbits(signature)
            fd_to_idx[fd] = i
            frame_list.append(fd)
        return signatures, fd_to_idx, frame_list

    def find_similarity(self, signatures, fd_to_idx, frame_list):
        min_duration = self.minLen
        max_duration = self.maxLen
        hash_size = self.hashSize
        bands = self.bands
        threshold = self.threshold

        rows = int(hash_size**2/bands)
        hash_buckets_list = [dict() for _ in range(bands)]

        for fh, signature in signatures.items():
            for i in range(bands):
                signature_band = signature[i*rows:(i+1)*rows]
                signature_band_bytes = signature_band.tobytes()
                if signature_band_bytes not in hash_buckets_list[i]:
                    hash_buckets_list[i][signature_band_bytes] = list()
                hash_buckets_list[i][signature_band_bytes].append(fh)
        
        candidate_pairs = set()
        for hash_buckets in hash_buckets_list:
            for hash_bucket in hash_buckets.values():
                if len(hash_bucket) > 1:
                    hash_bucket = sorted(hash_bucket)
                    for i in range(len(hash_bucket)):
                        for j in range(i+1, len(hash_bucket)):
                            candidate_pairs.add(tuple([hash_bucket[i],hash_bucket[j]]))

        # Check candidate pairs for similarity
        near_duplicates = list()
        for cpa, cpb in candidate_pairs:
            hd = sum(np.bitwise_xor(
                    np.unpackbits(signatures[cpa]), 
                    np.unpackbits(signatures[cpb])
            ))
            similarity = (hash_size**2 - hd) / hash_size**2
            if similarity > threshold and self.is_valid(cpa, cpb):
                ff = np.unpackbits(signatures[cpa])
                for idx in range(fd_to_idx[cpa]+1,fd_to_idx[cpb]):
                    hd = sum(np.bitwise_xor(
                        ff, 
                        np.unpackbits(signatures[frame_list[idx]])
                    ))
                    if ((hash_size**2 - hd) / hash_size**2) < 0.9:
                        near_duplicates.append((cpa, cpb, similarity))
                        break
                
        # Sort near-duplicates by descending similarity and return
        near_duplicates.sort(key=lambda x:x[2], reverse=True)
        return near_duplicates

    def prune_candidates(self, sims):
        def sort_candidates(x):
            return x[2], datetime.strptime(x[1], '%H-%M-%S.%f') - datetime.strptime(x[0], '%H-%M-%S.%f')
        
        sims.sort(key=sort_candidates, reverse=True)
        segments = list()
        final_sims = list()
        for s in sims:
            seg_start = datetime.strptime(s[0], '%H-%M-%S.%f')
            seg_end = datetime.strptime(s[1], '%H-%M-%S.%f')

            valid = True
            for seg in segments:
                if (seg_start >= seg[0] and seg_start <= seg[1]) or \
                (seg_end >= seg[0] and seg_end <= seg[1]) or \
                (seg_start <= seg[0] and seg_end >= seg[1]):
                    valid = False
                    break
            if valid:
                segments.append((seg_start,seg_end))
                delta = seg_end - seg_start
                final_sims.append((float(f'{seg_start.second}.{seg_start.microsecond}'), 
                    float(f'{delta.seconds}.{delta.microseconds}')))
        
        return final_sims

    def process_clip(self):
        frames = self.create_frames()
        signatures, fd_to_idx, frame_list = self.calculate_signatures(frames)
        sims = self.find_similarity(signatures, fd_to_idx, frame_list)
        final_sims = self.prune_candidates(sims)
        return final_sims
