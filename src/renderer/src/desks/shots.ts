// The Desks view without an office: four hired, or two hired and two Hire tiles. Faces and the messages rail on by default;
// `faces=0` and `messages=0` hide them. `working`: four mid-task, a live bubble, five messages. `quiet`: nobody talking, empty rail.
export const shots: { name: string; query?: string }[] = [
  { name: 'four' },
  { name: 'two', query: 'employees=2' },
  { name: 'working' },
  { name: 'quiet' },
  { name: 'working-no-rail', query: 'messages=0' },
  { name: 'worst' },
];
