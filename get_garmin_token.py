#!/usr/bin/env python3
"""
Garmin Connect Session Token Generator

This script uses the garminconnect Python library to authenticate with Garmin Connect
and retrieve a session token that can be used in the work-location-calendar app.

Installation:
    pip install garminconnect

Usage:
    python get_garmin_token.py

Or edit this file and add your credentials, then run:
    python get_garmin_token.py
"""

from garminconnect import Garmin
import sys

def get_garmin_token(email=None, password=None):
    """Get Garmin Connect session token."""
    
    # If credentials not provided, prompt for them
    if not email:
        email = input("Enter your Garmin Connect email: ").strip()
    if not password:
        import getpass
        password = getpass.getpass("Enter your Garmin Connect password: ")
    
    if not email or not password:
        print("❌ Error: Email and password are required")
        sys.exit(1)
    
    try:
        print("⏳ Connecting to Garmin Connect...")
        
        # Connect to Garmin
        client = Garmin(email, password)
        client.login()
        
        # Get session token
        # The garminconnect library stores session data in client.session_data
        session_token = None
        
        # Try different possible session token keys
        if hasattr(client, 'session_data'):
            session_token = (
                client.session_data.get('sessionId') or 
                client.session_data.get('token') or
                client.session_data.get('SESSIONID')
            )
        
        # If session_data doesn't have it, try accessing the session cookie directly
        if not session_token and hasattr(client, 'session'):
            if hasattr(client.session, 'cookies'):
                cookies = client.session.cookies
                if 'SESSIONID' in cookies:
                    session_token = cookies['SESSIONID']
                elif 'sessionId' in cookies:
                    session_token = cookies['sessionId']
        
        if not session_token:
            # Try to get it from the headers or response
            print("⚠️  Warning: Could not find session token in expected location.")
            print("   Attempting to extract from session...")
            
            # Try accessing the _session_data attribute if it exists
            if hasattr(client, '_session_data'):
                session_data = client._session_data
                session_token = (
                    session_data.get('sessionId') or 
                    session_data.get('token') or
                    session_data.get('SESSIONID')
                )
        
        if not session_token:
            print("❌ Error: Could not retrieve session token.")
            print("   The garminconnect library may have changed its API.")
            print("   Please check the library documentation or try a different approach.")
            sys.exit(1)
        
        print(f"\n✅ Connection successful!")
        print(f"\n📋 Session Token:")
        print(f"   {session_token}")
        print(f"\n💡 Copy the token above and paste it into the Garmin connection section in the app.")
        
        # Optional: Test by getting activities
        try:
            activities = client.get_activities(0, 1)
            if activities:
                print(f"\n✓ Test: Found {len(activities)} recent activity/activities")
        except Exception as e:
            print(f"\n⚠️  Note: Could not test activity retrieval: {e}")
            print("   The session token should still work, but you may need to refresh it periodically.")
        
        return session_token
        
    except Exception as e:
        print(f"❌ Error connecting to Garmin: {e}")
        print("\nPossible issues:")
        print("  - Incorrect email or password")
        print("  - Two-factor authentication enabled (may need to use app password)")
        print("  - Network connectivity issues")
        print("  - Garmin Connect service temporarily unavailable")
        sys.exit(1)

if __name__ == "__main__":
    # You can hardcode your credentials here if you prefer (not recommended for security)
    # email = "your-email@example.com"
    # password = "your-password"
    email = None
    password = None
    
    get_garmin_token(email, password)

