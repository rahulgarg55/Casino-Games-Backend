import { GENDER, LANGUAGE, COUNTRY, CITY } from '../constants';

export const getGenderString = (gender: number | undefined): string => {
  switch (gender) {
    case GENDER.MALE:
      return 'Male';
    case GENDER.FEMALE:
      return 'Female';
    case GENDER.TRANSGENDER:
      return 'Transgender';
    default:
      return 'Unknown';
  }
};

export const getLanguageString = (language: number | undefined): string => {
  switch (language) {
    case LANGUAGE.ENGLISH:
      return 'English';
    case LANGUAGE.SPANISH:
      return 'Spanish';
    case LANGUAGE.FRENCH:
      return 'French';
    default:
      return 'Unknown';
  }
};

export const getCountryString = (country: number | undefined): string => {
  switch (country) {
    case COUNTRY.USA:
      return 'USA';
    case COUNTRY.INDIA:
      return 'India';
    case COUNTRY.UK:
      return 'UK';
    default:
      return 'Unknown';
  }
};

export const getCityString = (city: number | undefined): string => {
  switch (city) {
    case CITY.NEW_YORK:
      return 'New York';
    case CITY.MUMBAI:
      return 'Mumbai';
    case CITY.LONDON:
      return 'London';
    default:
      return 'Unknown';
  }
};
