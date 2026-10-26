import React from "react";

const test = () => {
  const data = [
    {
      age: 20,
      surname: "chaudhary",
      city: "Patna",
    },
    {
      age: 19,
      surname: "chaudhary",
      city: "Mumbai",
    },
  ];

  return (
    <div>
      <table>
        {Object.keys(data[0]).map((key) => {
          return <th> {key}</th>;
        })}

        {data.map((obj) => {
          return (
            <tr>
              {Object.entries(obj).map((value) => {
                return <td> {value} </td>;
              })}
            </tr>
          );
        })}
      </table>
    </div>
  );
};

export default test;
