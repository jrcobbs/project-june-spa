import DataTable from 'react-data-table-component';

const response = await fetch('https://jsonplaceholder.typicode.com/users');
const json = await response.json();
console.log(json);

export default function UserTable({name}: {name: string}) {
  return (
    <div>
      <h1>{name} Table</h1>
      <DataTable columns={createColumns(json)} data={json} />
    </div>
  );
}

function createColumns(data: any[]) {
  return data
  .map(item => item?.name)
  .filter(name => name !== undefined && name !== null);
}