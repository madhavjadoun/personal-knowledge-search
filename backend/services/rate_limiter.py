import time
from collections import defaultdict
from threading import Lock
from fastapi import HTTPException, Request, status

class SlidingWindowRateLimiter:
    """
    A thread-safe in-memory sliding window rate limiter.
    """
    def __init__(self, window_seconds: int, max_requests: int, action_name: str = "API"):
        self.window_seconds = window_seconds
        self.max_requests = max_requests
        self.action_name = action_name
        self.requests = defaultdict(list)
        self.lock = Lock()

    def check_rate_limit(self, key: str, ip: str) -> None:
        now = time.time()
        with self.lock:
            # Filter timestamps to keep only those within the sliding window
            self.requests[key] = [t for t in self.requests[key] if now - t < self.window_seconds]
            
            if len(self.requests[key]) >= self.max_requests:
                print(f"[rate_limit] Rate limit EXCEEDED for action='{self.action_name}' | key='{key}' | IP='{ip}' | count={len(self.requests[key])}/{self.max_requests}")
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many requests for {self.action_name.lower()}. Please try again in a moment."
                )
            
            self.requests[key].append(now)

# Instantiate rate limiters for different contexts
upload_limiter = SlidingWindowRateLimiter(window_seconds=60, max_requests=5, action_name="Upload")
quiz_limiter = SlidingWindowRateLimiter(window_seconds=60, max_requests=5, action_name="Quiz Generation")
api_limiter = SlidingWindowRateLimiter(window_seconds=60, max_requests=60, action_name="API")
