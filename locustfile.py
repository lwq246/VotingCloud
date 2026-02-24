from locust import HttpUser, task, between
import uuid

class VotingCloudUser(HttpUser):
    wait_time = between(1, 5)
    host = "https://asia-southeast1-votingcloud-cb476.cloudfunctions.net"

    @task
    def submit_vote(self):
        user_id = str(uuid.uuid4())
        self.client.post(
            f"/submitVote/test-session-id",  # Replace with actual session ID if needed
            json={
                "userId": user_id,
                "hashedUserId": user_id,  # In real test, hash this value
                "optionId": "1"  # Use different option IDs for variety
            },
            headers={
                "Content-Type": "application/json"
            }
        )