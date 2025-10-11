'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface DayData {
  date: string
  count: number
  events: Array<{
    id: number
    name: string
    venue_name: string
  }>
}

interface MonthData {
  year: number
  month: number
  monthName: string
  days: DayData[]
  firstDayOfWeek: number
  totalDays: number
}

export default function EventHeatmap() {
  const [months, setMonths] = useState<MonthData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null)
  const [hoveredDay, setHoveredDay] = useState<DayData | null>(null)
  const [maxCount, setMaxCount] = useState(0) // För relativ färgskalning

  useEffect(() => {
    loadEventData()
  }, [])

  async function loadEventData() {
    try {
      // Hämta events för de kommande 3 månaderna (mer kompakt)
      const startDate = new Date()
      startDate.setDate(1) // Första dagen i nuvarande månad
      
      const endDate = new Date()
      endDate.setMonth(endDate.getMonth() + 3)
      endDate.setDate(0) // Sista dagen i +3 månad

      const { data: events, error } = await supabase
        .from('events')
        .select('id, name, date_time, venue_name, status')
        .gte('date_time', startDate.toISOString())
        .lte('date_time', endDate.toISOString())
        .in('status', ['published', 'pending_approval'])
        .order('date_time', { ascending: true })

      if (error) throw error

      // Gruppera events per dag
      const eventsByDate = new Map<string, DayData>()
      
      events?.forEach(event => {
        const date = event.date_time.split('T')[0]
        
        if (!eventsByDate.has(date)) {
          eventsByDate.set(date, {
            date,
            count: 0,
            events: []
          })
        }
        
        const dayData = eventsByDate.get(date)!
        dayData.count++
        dayData.events.push({
          id: event.id,
          name: event.name,
          venue_name: event.venue_name || 'Ingen plats'
        })
      })

      // Beräkna max antal events per dag (för relativ färgskalning)
      let maxEventsPerDay = 0
      eventsByDate.forEach(day => {
        if (day.count > maxEventsPerDay) {
          maxEventsPerDay = day.count
        }
      })
      setMaxCount(maxEventsPerDay)
      
      console.log('📊 Heatmap loaded:', {
        totalDays: eventsByDate.size,
        maxEventsPerDay,
        exampleDays: Array.from(eventsByDate.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
          .map(d => ({ date: d.date, count: d.count }))
      })
      
      // Skapa månads-data för de kommande 3 månaderna
      const monthsData: MonthData[] = []
      
      for (let i = 0; i < 3; i++) {
        const monthDate = new Date()
        monthDate.setMonth(monthDate.getMonth() + i)
        monthDate.setDate(1)
        
        const year = monthDate.getFullYear()
        const month = monthDate.getMonth()
        
        const monthName = monthDate.toLocaleDateString('sv-SE', { 
          month: 'long', 
          year: 'numeric' 
        })
        
        // Första veckodagen (0 = söndag, 1 = måndag, etc)
        const firstDay = monthDate.getDay()
        const firstDayOfWeek = firstDay === 0 ? 6 : firstDay - 1 // Konvertera till Måndag = 0
        
        // Antal dagar i månaden
        const totalDays = new Date(year, month + 1, 0).getDate()
        
        // Skapa array med alla dagar i månaden
        const days: DayData[] = []
        for (let day = 1; day <= totalDays; day++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          
          days.push(eventsByDate.get(dateStr) || {
            date: dateStr,
            count: 0,
            events: []
          })
        }
        
        monthsData.push({
          year,
          month,
          monthName,
          days,
          firstDayOfWeek,
          totalDays
        })
      }
      
      setMonths(monthsData)
      
    } catch (error) {
      console.error('Error loading event data:', error)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Tydlig färgskalning baserat på antal events
   */
  function getColorForCount(count: number): string {
    if (count === 0) return 'bg-gray-50'
    if (count === 1) return 'bg-blue-50'
    if (count === 2) return 'bg-blue-100'
    if (count === 3) return 'bg-blue-200'
    if (count === 4) return 'bg-blue-300'
    if (count === 5) return 'bg-blue-400'
    if (count <= 7) return 'bg-blue-500'
    if (count <= 10) return 'bg-blue-600'
    if (count <= 15) return 'bg-blue-700'
    return 'bg-blue-800'
  }

  
  function getTextColorForCount(count: number): string {
    if (count === 0) return 'text-gray-400'
    
    // Vit text för mörka bakgrunder
    if (count >= 5) return 'text-white'
    
    return 'text-gray-700'
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Event-kalender</h2>
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Event-kalender</h2>
          <p className="text-xs text-gray-600">
            Kommande 3 månader • Max {maxCount} events/dag
          </p>
        </div>
        
        {/* Legend */}
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span>Mindre</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 bg-gray-50 rounded"></div>
            <div className="w-3 h-3 bg-blue-50 rounded"></div>
            <div className="w-3 h-3 bg-blue-200 rounded"></div>
            <div className="w-3 h-3 bg-blue-400 rounded"></div>
            <div className="w-3 h-3 bg-blue-600 rounded"></div>
            <div className="w-3 h-3 bg-blue-800 rounded"></div>
          </div>
          <span>Mer</span>
        </div>
      </div>

      {/* Months */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {months.map((monthData, monthIndex) => (
          <div key={`${monthData.year}-${monthData.month}`}>
            <h3 className="text-xs font-medium text-gray-700 mb-2 capitalize">
              {monthData.monthName}
            </h3>
            
            {/* Weekday headers - endast första bokstaven */}
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {['M', 'T', 'O', 'T', 'F', 'L', 'S'].map((day, i) => (
                <div key={i} className="text-[10px] text-gray-500 text-center w-6">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid - kompaktare */}
            <div className="grid grid-cols-7 gap-0.5">
              {/* Empty cells för att starta på rätt veckodag */}
              {Array.from({ length: monthData.firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="w-6 h-6"></div>
              ))}
              
              {/* Days */}
              {monthData.days.map((day, dayIndex) => {
                const dayNumber = dayIndex + 1
                const isToday = day.date === new Date().toISOString().split('T')[0]
                
                return (
                  <div
                    key={day.date}
                    className="relative group"
                    onMouseEnter={() => setHoveredDay(day)}
                    onMouseLeave={() => setHoveredDay(null)}
                    onClick={() => day.count > 0 ? setSelectedDay(day) : null}
                  >
                    <div
                      className={`
                        w-6 h-6 rounded flex items-center justify-center
                        ${day.count > 0 ? 'cursor-pointer' : ''}
                        transition-all
                        ${getColorForCount(day.count)}
                        ${isToday ? 'ring-2 ring-orange-500 ring-offset-1' : ''}
                        ${day.count > 0 ? 'hover:scale-125 hover:shadow-lg hover:z-10' : ''}
                      `}
                      title={day.count > 0 ? `${day.count} events` : ''}
                    >
                      {/* Visa datum (dag i månaden) */}
                      <span className={`text-[8px] font-medium ${getTextColorForCount(day.count)}`}>
                        {dayNumber}
                      </span>
                    </div>
                    
                    {/* Tooltip på hover */}
                    {hoveredDay === day && day.count > 0 && (
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 z-20 pointer-events-none">
                        <div className="bg-gray-900 text-white px-2 py-1 rounded shadow-lg text-[10px] whitespace-nowrap">
                          <div className="font-semibold">
                            {new Date(day.date).toLocaleDateString('sv-SE', { 
                              day: 'numeric',
                              month: 'short'
                            })}
                          </div>
                          <div>
                            {day.count} event{day.count !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Selected day details - kompaktare */}
      {selectedDay && selectedDay.count > 0 && (
        <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="text-sm font-semibold text-blue-900">
                {new Date(selectedDay.date).toLocaleDateString('sv-SE', { 
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long'
                })}
              </h3>
              <p className="text-xs text-blue-700">
                {selectedDay.count} event{selectedDay.count !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-blue-600 hover:text-blue-800 text-xs font-bold"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {selectedDay.events.map((event) => (
              <div 
                key={event.id}
                className="bg-white p-2 rounded border border-blue-100 hover:border-blue-300 transition-colors text-xs"
              >
                <div className="font-medium text-gray-900 truncate">
                  {event.name}
                </div>
                <div className="text-[10px] text-gray-600 truncate">
                  📍 {event.venue_name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary stats - kompaktare */}
      <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xl font-bold text-gray-900">
            {months.reduce((sum, m) => sum + m.days.filter(d => d.count > 0).length, 0)}
          </div>
          <div className="text-[10px] text-gray-600">Dagar med events</div>
        </div>
        <div>
          <div className="text-xl font-bold text-gray-900">
            {months.reduce((sum, m) => sum + m.days.reduce((s, d) => s + d.count, 0), 0)}
          </div>
          <div className="text-[10px] text-gray-600">Totalt events</div>
        </div>
        <div>
          <div className="text-xl font-bold text-gray-900">
            {Math.round(
              months.reduce((sum, m) => sum + m.days.reduce((s, d) => s + d.count, 0), 0) /
              Math.max(months.reduce((sum, m) => sum + m.days.filter(d => d.count > 0).length, 0), 1)
            )}
          </div>
          <div className="text-[10px] text-gray-600">Snitt per dag</div>
        </div>
      </div>
    </div>
  )
}

