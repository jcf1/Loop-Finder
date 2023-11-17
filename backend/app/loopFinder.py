import numpy as np
import cv2
import imagehash
from PIL import Image
from datetime import timedelta, datetime
from moviepy.editor import VideoFileClip
from multiprocessing import Pool, Array

def bin_sum(tup):
    return (tup[0],tup[1],sum(tup[2]))

class loopFinder:
    def __init__(self, clip, minLen, maxLen, threshold, eval):
        self.clip = clip
        self.frames = 100
        self.minLen = minLen
        self.maxLen = maxLen
        self.hashSize = 64
        self.bands = 64
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

    def create_signatures(self):
        clip = self.clip
        hashSize = self.hashSize
        saving_frames_per_second = min(clip.fps, self.frames)
        step = 1 / clip.fps if saving_frames_per_second == 0 else 1 / saving_frames_per_second

        i = 0
        signatures = dict()
        fd_to_idx = dict()
        frame_list = list()
        for current_duration in np.arange(0, clip.duration, step):
            frame_duration_formatted = self.format_timedelta(timedelta(seconds=current_duration))
            frame = clip.get_frame(current_duration)
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame = Image.fromarray(frame)
            f = frame.convert("L").resize((hashSize+1,hashSize),Image.LANCZOS)
            dhash = imagehash.dhash(f,hashSize)
            signature = dhash.hash.flatten()

            signatures[frame_duration_formatted] = np.packbits(signature)
            fd_to_idx[frame_duration_formatted] = i
            frame_list.append(frame_duration_formatted)
            i += 1
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
        
        # Check candidate pairs for similarity
        candidate_pairs = set()
        found = set()
        for hash_buckets in hash_buckets_list:
            for hash_bucket in hash_buckets.values():
                if len(hash_bucket) > 1:
                    hash_bucket = sorted(hash_bucket)
                    for i in range(len(hash_bucket)):
                        for j in range(i+1, len(hash_bucket)):
                            cpa = hash_bucket[i]
                            cpb = hash_bucket[j]
                            tup = tuple([cpa,cpb])
                            if not tup in found:
                                if self.is_valid(cpa,cpb):
                                    candidate_pairs.add(tup)
                                found.add(tup)

        candidate_pairs_xor = list()
        for cpa, cpb in candidate_pairs:
            xor = np.bitwise_xor(np.unpackbits(signatures[cpa]),
                                  np.unpackbits(signatures[cpb]))
            candidate_pairs_xor.append((cpa,cpb,xor))

        # Use mutithresding to speed up array summations
        with Pool() as pool:
            candidate_pairs_sum = pool.map(bin_sum, candidate_pairs_xor)
            pool.close()
            pool.join()

        #Keep pairs that score above threshold score
        near_duplicates = list()
        _hash_size = hash_size**2
        for cpa, cpb, hd in candidate_pairs_sum:
            similarity = (_hash_size - hd) / _hash_size
            if similarity >= threshold:
                near_duplicates.append((cpa, cpb, similarity))

        # Sort near-duplicates by descending similarity and return
        if self.eval == 'quality':
            near_duplicates.sort(key=lambda x: x[2], reverse=True)
        elif self.eval == 'length':
            def calc_length(cpa, cpb):
                start_obj = datetime.strptime(cpa, '%H-%M-%S.%f')
                end_obj   = datetime.strptime(cpb, '%H-%M-%S.%f')
                return end_obj - start_obj
            near_duplicates.sort(key=lambda x: calc_length(x[0], x[1]), reverse=True)
        return near_duplicates

    def prune_candidates(self, sims):
        def sort_candidates(x):
            return x[2], datetime.strptime(x[1], '%H-%M-%S.%f') - datetime.strptime(x[0], '%H-%M-%S.%f')
        
        segments = list()
        final_sims = list()
        for s in sims:
            seg_start = datetime.strptime(s[0], '%H-%M-%S.%f')
            seg_end = datetime.strptime(s[1], '%H-%M-%S.%f')

            #Don't include results that have any overlap with another gif
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
                    float(f'{delta.seconds}.{delta.microseconds}'),
                    s[2]))
        return final_sims

    def process_clip(self):
        signatures, fd_to_idx, frame_list = self.create_signatures()
        sims = self.find_similarity(signatures, fd_to_idx, frame_list)
        final_sims = self.prune_candidates(sims)
        return final_sims
