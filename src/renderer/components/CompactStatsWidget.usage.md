# CompactStatsWidget Usage Guide

## Overview
The CompactStatsWidget provides a quick overview of user's reading statistics directly on the Browse page. It shows essential stats at a glance without requiring navigation to the full Statistics tab.

## Features
- **Live Stats**: Real-time reading statistics
- **Compact Design**: Fits perfectly alongside ContinueBanner
- **Responsive**: Works on mobile and desktop
- **Purple Theme**: Matches the overall design aesthetic

## Stats Displayed
1. **Total Read**: Number of chapters completed
2. **Day Streak**: Current consecutive reading days
3. **This Week**: Chapters read in the last 7 days
4. **Daily Avg**: Average chapters per day (last 30 days)
5. **Total Pages**: Estimated pages read (chapters × 20)

## Visual Design
- **Gradient Background**: Purple to blue gradient with transparency
- **Color-coded Icons**: Different colors for each stat type
- **Live Indicator**: Animated green dot showing real-time data
- **Motivational Footer**: Encourages continued reading

## States
1. **Loading**: Shows skeleton placeholder while fetching data
2. **Empty**: Friendly message when no reading data exists
3. **Populated**: Full stats display with all metrics

## Integration
The widget is automatically integrated into the Browse page using a responsive grid layout:
- **Mobile**: Single column (stacked)
- **Desktop**: Two columns (side by side with ContinueBanner)

## Data Sources
- Uses the same backend as the full Statistics tab
- Fetches data from `window.finishedChapters.list()`
- Calculates streaks, averages, and totals in real-time

## Performance
- Minimal API calls (only on mount)
- Efficient calculations with proper date handling
- No navigation or heavy operations

## Testing
To test the widget:
1. Read some manga chapters to generate data
2. Navigate to the Browse page
3. Verify the widget displays correct statistics
4. Test with no data (should show empty state)
5. Test loading state (may be brief due to local storage)

## Customization
The widget can be easily customized:
- Change color scheme by modifying gradient classes
- Adjust stats displayed by updating the grid layout
- Modify calculations in the `calculateStats` function
- Update icons by changing the imported Heroicons

## Future Enhancements
- Add click-to-expand functionality
- Include more detailed breakdowns
- Add charts or visual indicators
- Implement refresh functionality
- Add settings for personalization
